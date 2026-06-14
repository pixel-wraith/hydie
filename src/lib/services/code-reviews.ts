import fs from 'fs';
import { Octokit } from '@octokit/rest';
import type { RestEndpointMethodTypes } from '@octokit/rest';
import { Logger } from './logger';
import { ExclusionsService } from './exclusions';
import { dedupe_prs_by_number } from '$lib/utils/pull-requests';
import {
	is_bot_user,
	is_closed_unmerged,
	is_counted_comment,
	count_reviews_per_day,
	count_comments_by_pr,
	calculate_reviewer_stats,
	calculate_pr_sizes,
	calculate_contributor_stats,
	record_from_stored,
	type ReviewRecord,
	type CommentRecord,
	type PullRequestRecord
} from './metrics';
import { GITHUB_OWNER, GITHUB_REPO, GITHUB_TOKEN } from '$env/static/private';
import { ApiError } from '$lib/utils/api-error';
import type { ICodeReviewsData, IPullRequestInfo, IReviewComment } from '../../types';
import type { NumericRange } from '@sveltejs/kit';

// Re-exported so existing importers (and tests) keep importing it from here.
export { is_closed_unmerged };

type PullRequest = RestEndpointMethodTypes['pulls']['list']['response']['data'][number];
type PullRequestDetail = RestEndpointMethodTypes['pulls']['get']['response']['data'];
type Review = RestEndpointMethodTypes['pulls']['listReviews']['response']['data'][number];

/** A raw inline comment carrying both the metric fields and the feed fields. */
interface RawReviewComment extends CommentRecord {
	id: number;
	pr_title: string;
	pr_url: string;
	body: string;
	path: string;
	line: number | null;
	html_url: string;
}

export class CodeReviewsService {
	private file_name = 'data.json';
	private numberOfDays = 14;
	private octokit: Octokit;

	constructor() {
		if (!GITHUB_OWNER) {
			throw new ApiError('env::GITHUB_OWNER is not set', 500);
		}

		if (!GITHUB_REPO) {
			throw new ApiError('env::GITHUB_REPO is not set', 500);
		}

		if (!GITHUB_TOKEN) {
			throw new ApiError('env::GITHUB_TOKEN is not set', 500);
		}

		this.octokit = new Octokit({
			auth: GITHUB_TOKEN
		});
	}

	public async get_synced_data(): Promise<ICodeReviewsData> {
		try {
			if (fs.existsSync(this.file_name)) {
				const data = JSON.parse(fs.readFileSync(this.file_name, 'utf8'));
				// Ensure pr_sizes exists for backwards compatibility
				if (!data.pr_sizes) {
					data.pr_sizes = {};
				}
				// Ensure pull_requests exists for backwards compatibility
				if (!data.pull_requests) {
					data.pull_requests = [];
				}
				// Ensure pr_contributor_stats exists for backwards compatibility
				if (!data.pr_contributor_stats) {
					data.pr_contributor_stats = [];
				}
				// Ensure reviewer_stats exists for backwards compatibility
				if (!data.reviewer_stats) {
					data.reviewer_stats = {};
				}
				// Ensure review_comments exists for backwards compatibility
				if (!data.review_comments) {
					data.review_comments = [];
				}
				return data;
			} else {
				fs.writeFileSync(
					this.file_name,
					JSON.stringify({
						last_synced: null,
						status: 'not-synced',
						data: {},
						pr_sizes: {},
						pull_requests: [],
						pr_contributor_stats: [],
						reviewer_stats: {},
						review_comments: []
					})
				);

				return {
					data: {},
					pr_sizes: {},
					pull_requests: [],
					pr_contributor_stats: [],
					reviewer_stats: {},
					review_comments: [],
					status: 'not-synced',
					last_synced: null
				};
			}
		} catch (error: unknown) {
			Logger.error(error);
			throw error;
		}
	}

	public async sync() {
		try {
			const file_data = await this.get_synced_data();

			if (file_data.status === 'syncing') {
				return file_data;
			}

			let data: ICodeReviewsData = {
				...file_data,
				status: 'syncing'
			};

			fs.writeFileSync(this.file_name, JSON.stringify(data));

			await this.verify_repository_access();

			// Get exclusions
			const exclusions_service = new ExclusionsService();
			const excluded_prs = await exclusions_service.get_excluded_set();

			// Fetch the raw signal: PRs updated in the window, their details, all
			// reviews, and all inline comments. Filtering (window, self, bot, state)
			// happens in the pure metric functions, not here.
			const dates = this.get_date_range();
			const startDate = this.format_date_for_query(dates[0]);
			const recentPRs = await this.get_recent_pull_requests(startDate);
			const prDetails = await this.fetch_pr_details_in_parallel(recentPRs);

			const pr_records = this.to_pr_records(prDetails);
			const pr_author_map = new Map(pr_records.map((pr) => [pr.number, pr.author]));

			const review_records = await this.fetch_review_records(recentPRs, pr_author_map);
			const raw_comments = await this.fetch_review_comments(prDetails, pr_author_map);
			const comments_by_pr = count_comments_by_pr(raw_comments, dates);

			// Derive every metric from the normalized records.
			const code_reviews = count_reviews_per_day(review_records, dates);
			const reviewer_stats = calculate_reviewer_stats(review_records, raw_comments, dates);
			const pr_sizes = calculate_pr_sizes(pr_records, excluded_prs, dates);
			const pr_contributor_stats = calculate_contributor_stats(
				pr_records,
				comments_by_pr,
				excluded_prs,
				dates
			);
			const pull_requests = this.extract_pr_info(pr_records, comments_by_pr);
			const review_comments = this.build_comment_feed(raw_comments, dates);

			data = {
				last_synced: new Date().toISOString(),
				status: 'synced',
				data: code_reviews,
				pr_sizes: pr_sizes,
				pull_requests: pull_requests,
				pr_contributor_stats: pr_contributor_stats,
				reviewer_stats: reviewer_stats,
				review_comments: review_comments
			};

			fs.writeFileSync(this.file_name, JSON.stringify(data));

			return data;
		} catch (error) {
			Logger.error(error);
			// Reset status to error so user can retry
			const errorData: ICodeReviewsData = {
				...(await this.get_synced_data()),
				status: 'error'
			};
			fs.writeFileSync(this.file_name, JSON.stringify(errorData));
			throw error;
		}
	}

	public async recalculate_with_exclusions(): Promise<ICodeReviewsData> {
		try {
			const file_data = await this.get_synced_data();

			if (!file_data.pull_requests || file_data.pull_requests.length === 0) {
				// No PR data to recalculate, return as-is
				return file_data;
			}

			// Get current exclusions
			const exclusions_service = new ExclusionsService();
			const excluded_prs = await exclusions_service.get_excluded_set();

			// Recompute the PR-derived sections from stored PRs. Comments-received per
			// PR is taken from the stored counts (exclusions don't change it), so the
			// same metric functions can run without re-fetching raw comments. The
			// review grid and reviewer stats can't be recomputed without raw reviews,
			// so they keep their last-synced values (resolved fully by the Postgres
			// migration, issue #4).
			const dates = this.get_date_range();
			const pr_records = file_data.pull_requests.map(record_from_stored);
			const comments_by_pr = new Map(
				file_data.pull_requests.map((pr) => [pr.number, pr.review_comments_count])
			);

			const pr_sizes = calculate_pr_sizes(pr_records, excluded_prs, dates);
			const pr_contributor_stats = calculate_contributor_stats(
				pr_records,
				comments_by_pr,
				excluded_prs,
				dates
			);

			const data: ICodeReviewsData = {
				...file_data,
				pr_sizes: pr_sizes,
				pr_contributor_stats: pr_contributor_stats
			};

			fs.writeFileSync(this.file_name, JSON.stringify(data));

			return data;
		} catch (error) {
			Logger.error(error);
			throw error;
		}
	}

	/** Normalize PR details into metric records, capturing the author's bot flag. */
	private to_pr_records(prDetails: PullRequestDetail[]): PullRequestRecord[] {
		return prDetails
			.filter((pr) => pr.user?.login)
			.map((pr) => ({
				number: pr.number,
				author: pr.user!.login,
				author_is_bot: is_bot_user(pr.user),
				title: pr.title,
				html_url: pr.html_url,
				additions: pr.additions ?? 0,
				deletions: pr.deletions ?? 0,
				created_at: pr.created_at,
				merged_at: pr.merged_at,
				state: pr.state as 'open' | 'closed'
			}));
	}

	private extract_pr_info(
		pr_records: PullRequestRecord[],
		comments_by_pr: Map<number, number>
	): IPullRequestInfo[] {
		return pr_records.map((pr) => ({
			number: pr.number,
			title: pr.title,
			html_url: pr.html_url,
			author: pr.author,
			author_is_bot: pr.author_is_bot,
			additions: pr.additions,
			deletions: pr.deletions,
			created_at: pr.created_at,
			merged_at: pr.merged_at,
			state: pr.state,
			review_comments_count: comments_by_pr.get(pr.number) ?? 0
		}));
	}

	/** The comments feed: qualifying (in-window, non-self, non-bot) comments only. */
	private build_comment_feed(comments: RawReviewComment[], dates: string[]): IReviewComment[] {
		return comments
			.filter((comment) => is_counted_comment(comment, dates))
			.map((comment) => ({
				id: comment.id,
				pr_number: comment.pr_number,
				pr_title: comment.pr_title,
				pr_url: comment.pr_url,
				author: comment.author,
				body: comment.body,
				path: comment.path,
				line: comment.line,
				created_at: comment.created_at,
				html_url: comment.html_url
			}));
	}

	private format_date_for_query(date: string) {
		return `${date}T00:00:00Z`;
	}

	private get_recent_pull_requests = async (startDate: string): Promise<PullRequest[]> => {
		const recentPRs: PullRequest[] = [];
		const startDateTime = new Date(startDate);

		// Use async iterator to paginate and stop early when we hit old PRs
		for await (const response of this.octokit.paginate.iterator(this.octokit.rest.pulls.list, {
			owner: GITHUB_OWNER,
			repo: GITHUB_REPO,
			state: 'all',
			sort: 'updated',
			direction: 'desc',
			per_page: 100
		})) {
			let shouldStop = false;

			for (const pr of response.data) {
				if (new Date(pr.updated_at) < startDateTime) {
					// PRs are sorted by updated_at desc, so all remaining PRs are older
					shouldStop = true;
					break;
				}

				// Exclude PRs that were closed without being merged so they never
				// enter any downstream metric, the stored list, or the UI.
				if (is_closed_unmerged(pr)) {
					continue;
				}

				recentPRs.push(pr);
			}

			if (shouldStop) {
				break;
			}
		}

		// Paginating a list sorted by updated_at can surface the same PR on two
		// pages; dedupe so duplicates never reach storage or any calculation.
		return dedupe_prs_by_number(recentPRs);
	};

	private fetch_reviews_in_parallel = async (pullRequests: PullRequest[]): Promise<Review[]> => {
		const BATCH_SIZE = 10; // Respect rate limits while maximizing parallelism
		const allReviews: Review[] = [];

		for (let i = 0; i < pullRequests.length; i += BATCH_SIZE) {
			const batch = pullRequests.slice(i, i + BATCH_SIZE);
			const batchResults = await Promise.all(
				batch.map((pr) =>
					this.octokit.paginate(this.octokit.rest.pulls.listReviews, {
						owner: GITHUB_OWNER,
						repo: GITHUB_REPO,
						pull_number: pr.number,
						per_page: 100
					})
				)
			);
			allReviews.push(...batchResults.flat());
		}

		return allReviews;
	};

	/** Fetch all reviews and normalize them into metric records. */
	private fetch_review_records = async (
		recentPRs: PullRequest[],
		prAuthorMap: Map<number, string>
	): Promise<ReviewRecord[]> => {
		const allReviews = await this.fetch_reviews_in_parallel(recentPRs);

		return allReviews
			.filter((review) => review.user?.login)
			.map((review) => {
				const pr_number = review.pull_request_url
					? parseInt(review.pull_request_url.split('/').pop() || '0')
					: 0;
				return {
					pr_number,
					pr_author: prAuthorMap.get(pr_number) ?? '',
					reviewer: review.user!.login,
					reviewer_is_bot: is_bot_user(review.user),
					state: (review.state ?? '').toUpperCase(),
					submitted_at: review.submitted_at ?? null
				};
			});
	};

	private get_date_range() {
		const dates = [];
		for (let i = 0; i < this.numberOfDays; i++) {
			const date = new Date();
			date.setDate(date.getDate() - i);
			dates.unshift(date.toISOString().split('T')[0]);
		}
		return dates;
	}

	private verify_repository_access = async () => {
		try {
			await this.octokit.rest.repos.get({
				owner: GITHUB_OWNER,
				repo: GITHUB_REPO
			});
		} catch (error: unknown) {
			if (error instanceof Error && 'status' in error && error.status === 404) {
				throw new ApiError(
					'Repository not found. Please check if the organization and repository names are correct.',
					404
				);
			}
			if (error instanceof Error && 'status' in error && error.status === 403) {
				throw new ApiError(
					'Access denied. Please ensure your token has access to the organization repository.',
					403
				);
			}
			if (error instanceof Error && 'status' in error && error.status === 401) {
				throw new ApiError('Invalid token. Please check your token is correct.', 401);
			}
			if (error instanceof Error && 'status' in error) {
				throw new ApiError((error as Error).message, error.status as NumericRange<200, 599>);
			}
			throw new ApiError((error as Error).message, 500);
		}
	};

	private fetch_pr_details_in_parallel = async (
		pullRequests: PullRequest[]
	): Promise<PullRequestDetail[]> => {
		const BATCH_SIZE = 10;
		const allDetails: PullRequestDetail[] = [];

		for (let i = 0; i < pullRequests.length; i += BATCH_SIZE) {
			const batch = pullRequests.slice(i, i + BATCH_SIZE);
			const batchResults = await Promise.all(
				batch.map((pr) =>
					this.octokit.rest.pulls.get({
						owner: GITHUB_OWNER,
						repo: GITHUB_REPO,
						pull_number: pr.number
					})
				)
			);
			allDetails.push(...batchResults.map((r) => r.data));
		}

		return allDetails;
	};

	/**
	 * Fetch all inline review comments and normalize them. Comments are kept raw
	 * (including the PR author's own and bots); the metric functions apply the
	 * self/bot/window filters so the rules can change without re-fetching.
	 */
	private fetch_review_comments = async (
		prDetails: PullRequestDetail[],
		prAuthorMap: Map<number, string>
	): Promise<RawReviewComment[]> => {
		const BATCH_SIZE = 10;
		const allComments: RawReviewComment[] = [];

		for (let i = 0; i < prDetails.length; i += BATCH_SIZE) {
			const batch = prDetails.slice(i, i + BATCH_SIZE);
			const batchResults = await Promise.all(
				batch.map(async (pr) => {
					const comments = await this.octokit.paginate(this.octokit.rest.pulls.listReviewComments, {
						owner: GITHUB_OWNER,
						repo: GITHUB_REPO,
						pull_number: pr.number,
						per_page: 100
					});

					return comments
						.filter((comment) => comment.user?.login)
						.map(
							(comment): RawReviewComment => ({
								pr_number: pr.number,
								pr_author: prAuthorMap.get(pr.number) ?? '',
								author: comment.user!.login,
								author_is_bot: is_bot_user(comment.user),
								created_at: comment.created_at,
								id: comment.id,
								pr_title: pr.title,
								pr_url: pr.html_url,
								body: comment.body,
								path: comment.path,
								line: comment.line ?? comment.original_line ?? null,
								html_url: comment.html_url
							})
						);
				})
			);

			for (const result of batchResults) {
				allComments.push(...result);
			}
		}

		return allComments;
	};
}
