import { describe, test, expect } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/svelte';
import Page from './+page.svelte';
import type { ITeamStats } from '../types';

// The load() function always supplies team_stats; an all-null set stands in for
// "no visible data" in these render fixtures.
const empty_team_stats: ITeamStats = {
	avg_prs_reviewed: { value: null },
	total_prs_reviewed: { value: null },
	avg_comments_per_dev: { value: null },
	total_comments: { value: null },
	avg_comments_left_per_pr: { value: null },
	avg_pr_size: { value: null },
	total_prs: { value: null },
	avg_days_to_merge: { value: null },
	avg_comments_received_per_pr: { value: null }
};

describe('/+page.svelte', () => {
	test('should render not-synced message when status is not-synced', () => {
		render(Page, {
			props: {
				data: {
					status: 'not-synced',
					last_synced: null,
					data: {},
					pr_sizes: {},
					pull_requests: [],
					pr_contributor_stats: [],
					reviewer_stats: {},
					review_comments: [],
					team_stats: empty_team_stats
				}
			}
		});
		expect(screen.getByText('Code reviews have not been synced yet.')).toBeInTheDocument();
	});

	test('should render PR sizes section when pr_sizes data exists', () => {
		render(Page, {
			props: {
				data: {
					status: 'synced',
					last_synced: '2025-12-09T12:00:00Z',
					data: {
						testuser: {
							'2025-12-09': 1,
							'2025-12-08': 2
						}
					},
					pr_sizes: {
						testuser: {
							min: 10,
							max: 100,
							avg: 55,
							pr_count: 3
						}
					},
					pull_requests: [],
					pr_contributor_stats: [],
					reviewer_stats: {},
					review_comments: [],
					team_stats: empty_team_stats
				}
			}
		});
		expect(screen.getByText('Average PR Size (Lines Changed)')).toBeInTheDocument();
		expect(
			screen.getByText('PR size statistics for all PRs with activity in the last 14 days')
		).toBeInTheDocument();
	});

	test('should not render PR sizes section when pr_sizes is empty', () => {
		render(Page, {
			props: {
				data: {
					status: 'synced',
					last_synced: '2025-12-09T12:00:00Z',
					data: {
						testuser: {
							'2025-12-09': 1,
							'2025-12-08': 2
						}
					},
					pr_sizes: {},
					pull_requests: [],
					pr_contributor_stats: [],
					reviewer_stats: {},
					review_comments: [],
					team_stats: empty_team_stats
				}
			}
		});
		expect(screen.queryByText('Average PR Size (Lines Changed)')).not.toBeInTheDocument();
	});
});
