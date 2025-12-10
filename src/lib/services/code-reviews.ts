import fs from 'fs';
import { Octokit } from '@octokit/rest';
import type { RestEndpointMethodTypes } from '@octokit/rest';
import { Logger } from './logger';
import { GITHUB_OWNER, GITHUB_REPO, GITHUB_TOKEN } from '$env/static/private';
import { ApiError } from '$lib/utils/api-error';
import type { ICodeReviewsData, IPRSizeStats } from '../../types';
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
				return data;
			} else {
				fs.writeFileSync(
					this.file_name,
					JSON.stringify({
						last_synced: null,
						status: 'not-synced',
						data: {},
						pr_sizes: {}
					})
				);

				return {
					data: {},
					pr_sizes: {},
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

			const code_reviews = await this.get_code_reviews();
			const pr_sizes = await this.get_pr_sizes();

			data = {
				last_synced: new Date().toISOString(),
				status: 'synced',
				data: code_reviews,
				pr_sizes: pr_sizes
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

	private format_date_for_query(date: string) {
		return `${date}T00:00:00Z`;
	}

	private get_all_reviews = async (startDate: string): Promise<Review[]> => {
		try {
			// Get pull requests with early termination when we hit PRs older than our date range
			const recentPRs = await this.get_recent_pull_requests(startDate);

			// Fetch reviews for all PRs in parallel batches to respect rate limits
			const allReviews = await this.fetch_reviews_in_parallel(recentPRs);

			// Filter reviews by date
			return allReviews.filter((review: Review) => {
				const reviewDate = new Date(review.submitted_at!);
				return reviewDate >= new Date(startDate);
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
					'API rate limit exceeded or insufficient permissions. Please check your token has the necessary permissions.',
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

	private get_code_reviews = async (): Promise<Record<string, Record<string, number>>> => {
		try {
			// First verify we have access to the repository
			await this.verify_repository_access();

			const dates = this.get_date_range();
			const startDate = this.format_date_for_query(dates[0]);

			console.log('Fetching PR reviews... This may take a moment...');

			// Get all PR reviews within the date range
			const reviews = await this.get_all_reviews(startDate);

			// Process reviews by user and date
			const userStats: Record<string, Record<string, number>> = {};

			reviews.forEach((review: Review) => {
				const reviewDate = review.submitted_at!.split('T')[0];
				if (reviewDate >= dates[0] && reviewDate <= dates[this.numberOfDays - 1]) {
					const username: string = review.user!.login;
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

	private get_pr_sizes = async (): Promise<Record<string, IPRSizeStats>> => {
		try {
			const dates = this.get_date_range();
			const startDate = this.format_date_for_query(dates[0]);

			console.log('Fetching PR sizes... This may take a moment...');

			// Get recent PRs (updated in the last 14 days)
			const recentPRs = await this.get_recent_pull_requests(startDate);
			console.log('Recent PRs fetched:', recentPRs.length);

			// Fetch detailed PR info to get additions/deletions
			const prDetails = await this.fetch_pr_details_in_parallel(recentPRs);
			console.log('PR details fetched:', prDetails.length);

			// Group PRs by author and calculate stats
			const prsByAuthor: Record<string, number[]> = {};

			for (const pr of prDetails) {
				const author = pr.user?.login;
				if (!author) {
					console.log('Skipping PR with no author:', pr.number);
					continue;
				}

				const size = (pr.additions ?? 0) + (pr.deletions ?? 0);
				console.log(`PR #${pr.number} by ${author}: ${size} lines (${pr.additions} + ${pr.deletions})`);

				if (!prsByAuthor[author]) {
					prsByAuthor[author] = [];
				}
				prsByAuthor[author].push(size);
			}
			console.log('Authors with PRs:', Object.keys(prsByAuthor));

			// Calculate min, max, avg for each author
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
		} catch (error: unknown) {
			Logger.error(error);
			if (error instanceof Error && 'status' in error && error.status === 404) {
				throw new ApiError(
					'Repository not found. Please check if the organization and repository names are correct.',
					404
				);
			}
			if (error instanceof Error && 'status' in error && error.status === 403) {
				throw new ApiError(
					'API rate limit exceeded or insufficient permissions. Please check your token has the necessary permissions.',
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
}
