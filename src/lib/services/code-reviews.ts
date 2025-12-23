import fs from 'fs';
import { Octokit } from '@octokit/rest';
import type { RestEndpointMethodTypes } from '@octokit/rest';
import { Logger } from './logger';
import { ExclusionsService } from './exclusions';
import { GITHUB_OWNER, GITHUB_REPO, GITHUB_TOKEN } from '$env/static/private';
import { ApiError } from '$lib/utils/api-error';
import type {
	ICodeReviewsData,
	IPRSizeStats,
	IPullRequestInfo,
	IPRContributorStats,
	IReviewerStats,
	IReviewComment
} from '../../types';
import type { NumericRange } from '@sveltejs/kit';

type PullRequest = RestEndpointMethodTypes['pulls']['list']['response']['data'][number];
type PullRequestDetail = RestEndpointMethodTypes['pulls']['get']['response']['data'];
type Review = RestEndpointMethodTypes['pulls']['listReviews']['response']['data'][number];

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

			// Get exclusions
			const exclusions_service = new ExclusionsService();
			const excluded_prs = await exclusions_service.get_excluded_set();

			// Fetch PR details first (needed for both code_reviews and pr_sizes)
			const dates = this.get_date_range();
			const startDate = this.format_date_for_query(dates[0]);
			const recentPRs = await this.get_recent_pull_requests(startDate);
			const prDetails = await this.fetch_pr_details_in_parallel(recentPRs);

			// Fetch review comments for each PR
			const { countMap: reviewCommentsMap, comments: review_comments } =
				await this.fetch_review_comments_in_parallel(prDetails);

			// Extract PR info for storage (all PRs, not filtered)
			const pull_requests = this.extract_pr_info(prDetails, reviewCommentsMap);

			// Calculate stats with exclusions applied
			const code_reviews = await this.get_code_reviews(excluded_prs, prDetails);
			const pr_sizes = this.calculate_pr_sizes(prDetails, excluded_prs);
			const pr_contributor_stats = this.calculate_pr_contributor_stats(
				prDetails,
				reviewCommentsMap,
				excluded_prs
			);

			// Calculate reviewer stats (PRs reviewed and comments made)
			const reviewer_stats = await this.calculate_reviewer_stats(recentPRs, prDetails);

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

			// Recalculate PR sizes from stored pull_requests
			const pr_sizes = this.calculate_pr_sizes_from_stored(file_data.pull_requests, excluded_prs);

			// Recalculate PR contributor stats from stored pull_requests
			const pr_contributor_stats = this.calculate_pr_contributor_stats_from_stored(
				file_data.pull_requests,
				excluded_prs
			);

			// For code reviews, we need to filter based on excluded PRs
			// Since we don't store the PR number with each review, we'll recalculate
			// by filtering the existing data based on excluded PR authors
			const code_reviews = this.filter_code_reviews(
				file_data.data,
				file_data.pull_requests,
				excluded_prs
			);

			const data: ICodeReviewsData = {
				...file_data,
				data: code_reviews,
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

	private extract_pr_info(
		prDetails: PullRequestDetail[],
		reviewCommentsMap: Map<number, number>
	): IPullRequestInfo[] {
		return prDetails.map((pr) => ({
			number: pr.number,
			title: pr.title,
			html_url: pr.html_url,
			author: pr.user?.login ?? 'unknown',
			additions: pr.additions ?? 0,
			deletions: pr.deletions ?? 0,
			created_at: pr.created_at,
			merged_at: pr.merged_at,
			state: pr.state as 'open' | 'closed',
			review_comments_count: reviewCommentsMap.get(pr.number) ?? 0
		}));
	}

	private calculate_pr_sizes(
		prDetails: PullRequestDetail[],
		excludedPRs: Set<number>
	): Record<string, IPRSizeStats> {
		const prsByAuthor: Record<string, number[]> = {};

		for (const pr of prDetails) {
			const author = pr.user?.login;
			if (!author) {
				console.log('Skipping PR with no author:', pr.number);
				continue;
			}

			// Skip excluded PRs
			if (excludedPRs.has(pr.number)) {
				console.log(`Skipping excluded PR #${pr.number} by ${author}`);
				continue;
			}

			const size = (pr.additions ?? 0) + (pr.deletions ?? 0);
			console.log(
				`PR #${pr.number} by ${author}: ${size} lines (${pr.additions} + ${pr.deletions})`
			);

			if (!prsByAuthor[author]) {
				prsByAuthor[author] = [];
			}
			prsByAuthor[author].push(size);
		}

		return this.calculate_stats_from_sizes(prsByAuthor);
	}

	private calculate_pr_sizes_from_stored(
		pullRequests: IPullRequestInfo[],
		excludedPRs: Set<number>
	): Record<string, IPRSizeStats> {
		const prsByAuthor: Record<string, number[]> = {};

		for (const pr of pullRequests) {
			// Skip excluded PRs
			if (excludedPRs.has(pr.number)) {
				console.log(`Skipping excluded PR #${pr.number} by ${pr.author}`);
				continue;
			}

			const size = pr.additions + pr.deletions;

			if (!prsByAuthor[pr.author]) {
				prsByAuthor[pr.author] = [];
			}
			prsByAuthor[pr.author].push(size);
		}

		return this.calculate_stats_from_sizes(prsByAuthor);
	}

	private calculate_stats_from_sizes(
		prsByAuthor: Record<string, number[]>
	): Record<string, IPRSizeStats> {
		const result: Record<string, IPRSizeStats> = {};

		for (const [author, sizes] of Object.entries(prsByAuthor)) {
			if (sizes.length === 0) continue;

			const min = Math.min(...sizes);
			const max = Math.max(...sizes);
			const avg = Math.round(sizes.reduce((sum, s) => sum + s, 0) / sizes.length);

			result[author] = {
				min,
				max,
				avg,
				pr_count: sizes.length
			};
		}

		return result;
	}

	private calculate_pr_contributor_stats_from_stored(
		pullRequests: IPullRequestInfo[],
		excludedPRs: Set<number>
	): IPRContributorStats[] {
		const dates = this.get_date_range();
		const statsByAuthor = new Map<string, IPRContributorStats>();

		for (const pr of pullRequests) {
			const author = pr.author;
			if (!author) continue;

			// Skip excluded PRs
			if (excludedPRs.has(pr.number)) continue;

			const createdDate = pr.created_at.split('T')[0];

			// Only count PRs created within our date range
			if (createdDate < dates[0] || createdDate > dates[dates.length - 1]) continue;

			if (!statsByAuthor.has(author)) {
				const prsByDate: Record<string, number> = {};
				dates.forEach((date) => (prsByDate[date] = 0));

				statsByAuthor.set(author, {
					author,
					prs_by_date: prsByDate,
					prs: [],
					avg_days_to_merge: null,
					avg_review_comments: 0,
					total_prs: 0
				});
			}

			const stats = statsByAuthor.get(author)!;

			// Count PRs by date
			if (stats.prs_by_date[createdDate] !== undefined) {
				stats.prs_by_date[createdDate]++;
			}

			// Calculate days to merge or age for open PRs
			let daysToMerge: number | null = null;
			if (pr.merged_at) {
				const created = new Date(pr.created_at);
				const merged = new Date(pr.merged_at);
				daysToMerge = Math.ceil((merged.getTime() - created.getTime()) / (1000 * 60 * 60 * 24));
			} else if (pr.state === 'open') {
				const created = new Date(pr.created_at);
				const now = new Date();
				daysToMerge = Math.ceil((now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24));
			}

			stats.prs.push({
				number: pr.number,
				title: pr.title,
				html_url: pr.html_url,
				created_at: pr.created_at,
				merged_at: pr.merged_at,
				state: pr.state,
				days_to_merge: daysToMerge,
				review_comments_count: pr.review_comments_count
			});

			stats.total_prs++;
		}

		// Calculate averages for each author
		for (const stats of statsByAuthor.values()) {
			const prsWithMergeTime = stats.prs.filter((pr) => pr.days_to_merge !== null);
			if (prsWithMergeTime.length > 0) {
				const totalDays = prsWithMergeTime.reduce((sum, pr) => sum + (pr.days_to_merge ?? 0), 0);
				stats.avg_days_to_merge = Math.round((totalDays / prsWithMergeTime.length) * 10) / 10;
			}

			const totalComments = stats.prs.reduce((sum, pr) => sum + pr.review_comments_count, 0);
			stats.avg_review_comments =
				stats.prs.length > 0 ? Math.round((totalComments / stats.prs.length) * 10) / 10 : 0;
		}

		// Sort by total PRs descending
		return Array.from(statsByAuthor.values()).sort((a, b) => b.total_prs - a.total_prs);
	}

	private filter_code_reviews(
		codeReviews: Record<string, Record<string, number>>,
		pullRequests: IPullRequestInfo[],
		excludedPRs: Set<number>
	): Record<string, Record<string, number>> {
		// Build a map of excluded PR authors
		const excludedAuthors = new Set<string>();
		for (const pr of pullRequests) {
			if (excludedPRs.has(pr.number)) {
				excludedAuthors.add(pr.author);
			}
		}

		// If no PRs are excluded, return as-is
		if (excludedAuthors.size === 0) {
			return codeReviews;
		}

		// Note: This is a simplified approach. Since we don't track which reviews
		// belong to which PRs, we cannot fully filter reviews on excluded PRs.
		// The full filtering happens during sync when we have access to review data.
		// For recalculation, we return the existing code reviews unchanged.
		return codeReviews;
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
				recentPRs.push(pr);
			}

			if (shouldStop) {
				break;
			}
		}

		return recentPRs;
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

	private get_code_reviews = async (
		excludedPRs: Set<number>,
		prDetails: PullRequestDetail[]
	): Promise<Record<string, Record<string, number>>> => {
		try {
			// First verify we have access to the repository
			await this.verify_repository_access();

			const dates = this.get_date_range();
			const startDate = this.format_date_for_query(dates[0]);

			console.log('Fetching PR reviews... This may take a moment...');

			// Build a map of PR number to author for exclusion filtering
			const prAuthorMap = new Map<number, string>();
			for (const pr of prDetails) {
				if (pr.user?.login) {
					prAuthorMap.set(pr.number, pr.user.login);
				}
			}

			// Get all PR reviews within the date range
			const recentPRs = await this.get_recent_pull_requests(startDate);
			const allReviews = await this.fetch_reviews_in_parallel(recentPRs);

			// Filter reviews by date
			const reviews = allReviews.filter((review: Review) => {
				const reviewDate = new Date(review.submitted_at!);
				return reviewDate >= new Date(startDate);
			});

			// Process reviews by user and date, excluding self-reviews
			const userStats: Record<string, Record<string, number>> = {};

			reviews.forEach((review: Review) => {
				const reviewDate = review.submitted_at!.split('T')[0];
				if (reviewDate >= dates[0] && reviewDate <= dates[this.numberOfDays - 1]) {
					const username: string = review.user!.login;
					const prNumber = review.pull_request_url
						? parseInt(review.pull_request_url.split('/').pop() || '0')
						: 0;

					const prAuthor = prAuthorMap.get(prNumber);

					// Skip self-reviews (reviews on the reviewer's own PR)
					if (prAuthor === username) {
						console.log(`Skipping self-review by ${username} on their own PR #${prNumber}`);
						return;
					}

					if (!userStats[username]) {
						userStats[username] = {};
						dates.forEach((date) => (userStats[username][date] = 0));
					}
					userStats[username][reviewDate]++;
				}
			});

			return userStats;
		} catch (error: unknown) {
			Logger.error(error);
			throw error;
		}
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

	private fetch_review_comments_in_parallel = async (
		prDetails: PullRequestDetail[]
	): Promise<{ countMap: Map<number, number>; comments: IReviewComment[] }> => {
		const BATCH_SIZE = 10;
		const reviewCommentsMap = new Map<number, number>();
		const allReviewComments: IReviewComment[] = [];

		console.log('Fetching review comments for PRs...');

		for (let i = 0; i < prDetails.length; i += BATCH_SIZE) {
			const batch = prDetails.slice(i, i + BATCH_SIZE);
			const batchResults = await Promise.all(
				batch.map(async (pr) => {
					const prAuthor = pr.user?.login;
					const comments = await this.octokit.paginate(this.octokit.rest.pulls.listReviewComments, {
						owner: GITHUB_OWNER,
						repo: GITHUB_REPO,
						pull_number: pr.number,
						per_page: 100
					});

					// Filter to only comments from other devs (not the PR author)
					const otherDevComments = comments.filter((comment) => comment.user?.login !== prAuthor);

					// Extract full comment data
					const extractedComments: IReviewComment[] = otherDevComments.map((comment) => ({
						id: comment.id,
						pr_number: pr.number,
						pr_title: pr.title,
						pr_url: pr.html_url,
						author: comment.user?.login ?? 'unknown',
						body: comment.body,
						path: comment.path,
						line: comment.line ?? comment.original_line ?? null,
						created_at: comment.created_at,
						html_url: comment.html_url
					}));

					return {
						prNumber: pr.number,
						count: otherDevComments.length,
						comments: extractedComments
					};
				})
			);

			for (const result of batchResults) {
				reviewCommentsMap.set(result.prNumber, result.count);
				allReviewComments.push(...result.comments);
			}
		}

		return { countMap: reviewCommentsMap, comments: allReviewComments };
	};

	private calculate_pr_contributor_stats(
		prDetails: PullRequestDetail[],
		reviewCommentsMap: Map<number, number>,
		excludedPRs: Set<number>
	): IPRContributorStats[] {
		const dates = this.get_date_range();
		const statsByAuthor = new Map<string, IPRContributorStats>();

		for (const pr of prDetails) {
			const author = pr.user?.login;
			if (!author) continue;

			// Skip excluded PRs
			if (excludedPRs.has(pr.number)) continue;

			const createdDate = pr.created_at.split('T')[0];

			// Only count PRs created within our date range
			if (createdDate < dates[0] || createdDate > dates[dates.length - 1]) continue;

			if (!statsByAuthor.has(author)) {
				const prsByDate: Record<string, number> = {};
				dates.forEach((date) => (prsByDate[date] = 0));

				statsByAuthor.set(author, {
					author,
					prs_by_date: prsByDate,
					prs: [],
					avg_days_to_merge: null,
					avg_review_comments: 0,
					total_prs: 0
				});
			}

			const stats = statsByAuthor.get(author)!;

			// Count PRs by date
			if (stats.prs_by_date[createdDate] !== undefined) {
				stats.prs_by_date[createdDate]++;
			}

			// Calculate days to merge or age for open PRs
			let daysToMerge: number | null = null;
			if (pr.merged_at) {
				const created = new Date(pr.created_at);
				const merged = new Date(pr.merged_at);
				daysToMerge = Math.ceil((merged.getTime() - created.getTime()) / (1000 * 60 * 60 * 24));
			} else if (pr.state === 'open') {
				const created = new Date(pr.created_at);
				const now = new Date();
				daysToMerge = Math.ceil((now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24));
			}

			const reviewComments = reviewCommentsMap.get(pr.number) ?? 0;

			stats.prs.push({
				number: pr.number,
				title: pr.title,
				html_url: pr.html_url,
				created_at: pr.created_at,
				merged_at: pr.merged_at,
				state: pr.state as 'open' | 'closed',
				days_to_merge: daysToMerge,
				review_comments_count: reviewComments
			});

			stats.total_prs++;
		}

		// Calculate averages for each author
		for (const stats of statsByAuthor.values()) {
			const prsWithMergeTime = stats.prs.filter((pr) => pr.days_to_merge !== null);
			if (prsWithMergeTime.length > 0) {
				const totalDays = prsWithMergeTime.reduce((sum, pr) => sum + (pr.days_to_merge ?? 0), 0);
				stats.avg_days_to_merge = Math.round((totalDays / prsWithMergeTime.length) * 10) / 10;
			}

			const totalComments = stats.prs.reduce((sum, pr) => sum + pr.review_comments_count, 0);
			stats.avg_review_comments =
				stats.prs.length > 0 ? Math.round((totalComments / stats.prs.length) * 10) / 10 : 0;
		}

		// Sort by total PRs descending
		return Array.from(statsByAuthor.values()).sort((a, b) => b.total_prs - a.total_prs);
	}

	private async calculate_reviewer_stats(
		recentPRs: PullRequest[],
		prDetails: PullRequestDetail[]
	): Promise<Record<string, IReviewerStats>> {
		console.log('Calculating reviewer stats...');

		// Build a map of PR number to author
		const prAuthorMap = new Map<number, string>();
		for (const pr of prDetails) {
			if (pr.user?.login) {
				prAuthorMap.set(pr.number, pr.user.login);
			}
		}

		// Fetch all reviews
		const allReviews = await this.fetch_reviews_in_parallel(recentPRs);

		// Track unique PRs reviewed by each reviewer (excluding self-reviews)
		const reviewerPRs = new Map<string, Set<number>>();

		for (const review of allReviews) {
			const reviewer = review.user?.login;
			if (!reviewer) continue;

			const prNumber = review.pull_request_url
				? parseInt(review.pull_request_url.split('/').pop() || '0')
				: 0;

			const prAuthor = prAuthorMap.get(prNumber);

			// Skip self-reviews
			if (prAuthor === reviewer) continue;

			if (!reviewerPRs.has(reviewer)) {
				reviewerPRs.set(reviewer, new Set());
			}
			reviewerPRs.get(reviewer)!.add(prNumber);
		}

		// Fetch all review comments and count by reviewer (excluding self-comments)
		const reviewerComments = new Map<string, number>();
		const BATCH_SIZE = 10;

		for (let i = 0; i < prDetails.length; i += BATCH_SIZE) {
			const batch = prDetails.slice(i, i + BATCH_SIZE);
			const batchResults = await Promise.all(
				batch.map(async (pr) => {
					const prAuthor = pr.user?.login;
					const comments = await this.octokit.paginate(this.octokit.rest.pulls.listReviewComments, {
						owner: GITHUB_OWNER,
						repo: GITHUB_REPO,
						pull_number: pr.number,
						per_page: 100
					});

					// Count comments by each reviewer (excluding self-comments)
					const commentsByReviewer = new Map<string, number>();
					for (const comment of comments) {
						const commenter = comment.user?.login;
						if (!commenter || commenter === prAuthor) continue;

						commentsByReviewer.set(commenter, (commentsByReviewer.get(commenter) || 0) + 1);
					}

					return commentsByReviewer;
				})
			);

			// Aggregate comment counts
			for (const commentMap of batchResults) {
				for (const [reviewer, count] of commentMap) {
					reviewerComments.set(reviewer, (reviewerComments.get(reviewer) || 0) + count);
				}
			}
		}

		// Build the reviewer stats
		const result: Record<string, IReviewerStats> = {};

		// Get all unique reviewers from both reviews and comments
		const allReviewers = new Set([...reviewerPRs.keys(), ...reviewerComments.keys()]);

		for (const reviewer of allReviewers) {
			const prsReviewed = reviewerPRs.get(reviewer)?.size || 0;
			const totalComments = reviewerComments.get(reviewer) || 0;

			result[reviewer] = {
				reviewer,
				total_prs_reviewed: prsReviewed,
				total_review_comments: totalComments,
				avg_comments_per_pr:
					prsReviewed > 0 ? Math.round((totalComments / prsReviewed) * 10) / 10 : 0
			};
		}

		return result;
	}
}
