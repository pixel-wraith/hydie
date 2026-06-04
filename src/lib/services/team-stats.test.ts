import { describe, it, expect } from 'vitest';
import { calculate_team_stats } from './team-stats';
import type { ICodeReviewsData, IPRContributorStats, IPRDetail, IReviewerStats } from '../../types';

const reviewer = (overrides: Partial<IReviewerStats> & { reviewer: string }): IReviewerStats => ({
	total_prs_reviewed: 0,
	total_review_comments: 0,
	avg_comments_per_pr: 0,
	...overrides
});

const pr_detail = (overrides: Partial<IPRDetail> = {}): IPRDetail => ({
	number: 1,
	title: 'PR',
	html_url: 'https://example.com',
	created_at: '2025-12-20T00:00:00Z',
	merged_at: null,
	state: 'open',
	days_to_merge: null,
	review_comments_count: 0,
	...overrides
});

const contributor = (
	overrides: Partial<IPRContributorStats> & { author: string }
): IPRContributorStats => ({
	prs_by_date: {},
	prs: [],
	avg_days_to_merge: null,
	avg_review_comments: 0,
	total_prs: 0,
	...overrides
});

const make_data = (overrides: Partial<ICodeReviewsData> = {}): ICodeReviewsData => ({
	last_synced: '2025-12-23T00:00:00.000Z',
	status: 'synced',
	data: {},
	pr_sizes: {},
	pull_requests: [],
	pr_contributor_stats: [],
	reviewer_stats: {},
	review_comments: [],
	...overrides
});

describe('calculate_team_stats', () => {
	describe('reviews section', () => {
		it('averages PRs reviewed and comments per dev (macro) and sums totals', () => {
			const data = make_data({
				reviewer_stats: {
					alice: reviewer({
						reviewer: 'alice',
						total_prs_reviewed: 4,
						total_review_comments: 10,
						reviewed_pr_numbers: [1, 2, 3, 4]
					}),
					bob: reviewer({
						reviewer: 'bob',
						total_prs_reviewed: 2,
						total_review_comments: 0,
						reviewed_pr_numbers: [4, 5]
					})
				}
			});

			const stats = calculate_team_stats(data);

			expect(stats.avg_prs_reviewed.value).toBe(3); // (4 + 2) / 2
			expect(stats.avg_comments_per_dev.value).toBe(5); // (10 + 0) / 2
			expect(stats.total_comments.value).toBe(10);
		});

		it('counts total PRs reviewed as the distinct union of reviewed PR numbers', () => {
			const data = make_data({
				reviewer_stats: {
					alice: reviewer({ reviewer: 'alice', reviewed_pr_numbers: [1, 2, 3] }),
					bob: reviewer({ reviewer: 'bob', reviewed_pr_numbers: [3, 4] })
				}
			});

			// Union {1,2,3,4} = 4 distinct, not the sum of 5.
			const stats = calculate_team_stats(data);
			expect(stats.total_prs_reviewed.value).toBe(4);
			// An exact union is not flagged approximate.
			expect(stats.total_prs_reviewed.approximate).toBeFalsy();
		});

		it('falls back to summing counts (flagged approximate) when reviewed_pr_numbers is absent', () => {
			const data = make_data({
				reviewer_stats: {
					alice: reviewer({ reviewer: 'alice', total_prs_reviewed: 3, total_review_comments: 6 }),
					bob: reviewer({ reviewer: 'bob', total_prs_reviewed: 2, total_review_comments: 0 })
				}
			});

			const stats = calculate_team_stats(data);
			expect(stats.total_prs_reviewed.value).toBe(5);
			expect(stats.total_prs_reviewed.approximate).toBe(true);
			// The average that divides by the over-counted total inherits the flag.
			expect(stats.avg_comments_left_per_pr.value).toBe(1.2); // 6 / 5
			expect(stats.avg_comments_left_per_pr.approximate).toBe(true);
		});

		it('falls back to summing counts when reviewed_pr_numbers is only partially present', () => {
			// A sync writes reviewed_pr_numbers for every reviewer at once, so a mixed
			// set is not reachable in practice. If it ever occurs we cannot build an
			// exact union (the bare reviewer contributes no PR numbers), so the safe,
			// documented behaviour is to fall back to the sum of counts.
			const data = make_data({
				reviewer_stats: {
					alice: reviewer({
						reviewer: 'alice',
						total_prs_reviewed: 3,
						reviewed_pr_numbers: [1, 2, 3]
					}),
					bob: reviewer({ reviewer: 'bob', total_prs_reviewed: 2 })
				}
			});

			expect(calculate_team_stats(data).total_prs_reviewed.value).toBe(5);
		});

		it('computes avg comments left per PR as total comments over distinct PRs (micro)', () => {
			const data = make_data({
				reviewer_stats: {
					alice: reviewer({
						reviewer: 'alice',
						total_review_comments: 7,
						reviewed_pr_numbers: [1, 2]
					}),
					bob: reviewer({
						reviewer: 'bob',
						total_review_comments: 2,
						reviewed_pr_numbers: [2, 3]
					})
				}
			});

			// 9 comments / 3 distinct PRs = 3
			expect(calculate_team_stats(data).avg_comments_left_per_pr.value).toBe(3);
		});

		it('returns null review metrics when no reviewers are visible', () => {
			const stats = calculate_team_stats(make_data());
			expect(stats.avg_prs_reviewed.value).toBeNull();
			expect(stats.total_prs_reviewed.value).toBeNull();
			expect(stats.avg_comments_per_dev.value).toBeNull();
			expect(stats.total_comments.value).toBeNull();
			expect(stats.avg_comments_left_per_pr.value).toBeNull();
		});
	});

	describe('pr size section', () => {
		it('computes the mean of the visible devs per-dev average sizes (macro)', () => {
			const data = make_data({
				pr_sizes: {
					alice: { min: 1, max: 100, avg: 50, pr_count: 1 },
					bob: { min: 1, max: 100, avg: 100, pr_count: 3 }
				}
			});

			// (50 + 100) / 2 devs = 75 lines — pr_count does not weight the result.
			expect(calculate_team_stats(data).avg_pr_size.value).toBe(75);
		});

		it('returns null PR size when no sizes are visible', () => {
			expect(calculate_team_stats(make_data()).avg_pr_size.value).toBeNull();
		});
	});

	describe('contributions section', () => {
		it('sums total PRs and averages days-to-merge over merged PRs only (micro)', () => {
			const data = make_data({
				pr_contributor_stats: [
					contributor({
						author: 'alice',
						total_prs: 2,
						prs: [
							pr_detail({ number: 1, days_to_merge: 2, review_comments_count: 4 }),
							pr_detail({ number: 2, days_to_merge: null, review_comments_count: 0 }) // open
						]
					}),
					contributor({
						author: 'bob',
						total_prs: 1,
						prs: [pr_detail({ number: 3, days_to_merge: 6, review_comments_count: 2 })]
					})
				]
			});

			const stats = calculate_team_stats(data);
			expect(stats.total_prs.value).toBe(3);
			// merged days: (2 + 6) / 2 merged PRs = 4 (the open PR is not a fake 0)
			expect(stats.avg_days_to_merge.value).toBe(4);
			// comments received: (4 + 0 + 2) / 3 PRs = 2
			expect(stats.avg_comments_received_per_pr.value).toBe(2);
		});

		it('returns null days-to-merge when nothing has merged', () => {
			const data = make_data({
				pr_contributor_stats: [
					contributor({
						author: 'alice',
						total_prs: 1,
						prs: [pr_detail({ number: 1, days_to_merge: null })]
					})
				]
			});

			expect(calculate_team_stats(data).avg_days_to_merge.value).toBeNull();
		});

		it('returns null contribution metrics when no contributors are visible', () => {
			const stats = calculate_team_stats(make_data());
			expect(stats.total_prs.value).toBeNull();
			expect(stats.avg_days_to_merge.value).toBeNull();
			expect(stats.avg_comments_received_per_pr.value).toBeNull();
		});
	});
});
