import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs';
import {
	DeveloperVisibilityService,
	apply_visibility_filter,
	list_dashboard_developers
} from './developer-visibility';
import type { ICodeReviewsData, IDeveloperVisibility } from '../../types';

vi.mock('fs');

const make_data = (overrides: Partial<ICodeReviewsData> = {}): ICodeReviewsData => ({
	last_synced: '2025-12-23T00:00:00.000Z',
	status: 'synced',
	data: {
		alice: { '2025-12-22': 3, '2025-12-23': 1 },
		bob: { '2025-12-22': 0, '2025-12-23': 2 }
	},
	pr_sizes: {
		alice: { min: 1, max: 10, avg: 5, pr_count: 2 },
		manager: { min: 500, max: 7000, avg: 3000, pr_count: 4 }
	},
	pull_requests: [],
	pr_contributor_stats: [
		{
			author: 'alice',
			prs_by_date: { '2025-12-22': 1, '2025-12-23': 0 },
			prs: [],
			avg_days_to_merge: 2,
			avg_review_comments: 1,
			total_prs: 1
		},
		{
			author: 'manager',
			prs_by_date: { '2025-12-22': 2, '2025-12-23': 1 },
			prs: [],
			avg_days_to_merge: 5,
			avg_review_comments: 0,
			total_prs: 3
		}
	],
	reviewer_stats: {
		alice: {
			reviewer: 'alice',
			total_prs_reviewed: 4,
			total_review_comments: 8,
			avg_comments_per_pr: 2
		},
		bob: {
			reviewer: 'bob',
			total_prs_reviewed: 2,
			total_review_comments: 2,
			avg_comments_per_pr: 1
		}
	},
	review_comments: [],
	...overrides
});

const empty_hidden = (overrides: Partial<IDeveloperVisibility> = {}): IDeveloperVisibility => ({
	reviews: [],
	pr_sizes: [],
	contributor_stats: [],
	last_modified: null,
	...overrides
});

describe('apply_visibility_filter', () => {
	it('returns the data unchanged when nothing is hidden', () => {
		const data = make_data();
		const result = apply_visibility_filter(data, empty_hidden());

		expect(Object.keys(result.data)).toEqual(['alice', 'bob']);
		expect(Object.keys(result.pr_sizes)).toEqual(['alice', 'manager']);
		expect(result.pr_contributor_stats.map((s) => s.author)).toEqual(['alice', 'manager']);
		expect(Object.keys(result.reviewer_stats)).toEqual(['alice', 'bob']);
	});

	it('removes a hidden reviewer from the reviews grid and reviewer stats only', () => {
		const data = make_data();
		const result = apply_visibility_filter(data, empty_hidden({ reviews: ['bob'] }));

		expect(Object.keys(result.data)).toEqual(['alice']);
		expect(Object.keys(result.reviewer_stats)).toEqual(['alice']);
		// Author-role sections untouched
		expect(Object.keys(result.pr_sizes)).toEqual(['alice', 'manager']);
		expect(result.pr_contributor_stats.map((s) => s.author)).toEqual(['alice', 'manager']);
	});

	it('removes a hidden author from PR sizes only', () => {
		const data = make_data();
		const result = apply_visibility_filter(data, empty_hidden({ pr_sizes: ['manager'] }));

		expect(Object.keys(result.pr_sizes)).toEqual(['alice']);
		// Other sections untouched
		expect(result.pr_contributor_stats.map((s) => s.author)).toEqual(['alice', 'manager']);
		expect(Object.keys(result.data)).toEqual(['alice', 'bob']);
	});

	it('removes a hidden author from contributor stats only', () => {
		const data = make_data();
		const result = apply_visibility_filter(data, empty_hidden({ contributor_stats: ['manager'] }));

		expect(result.pr_contributor_stats.map((s) => s.author)).toEqual(['alice']);
		// PR sizes for the manager still present (independent toggle)
		expect(Object.keys(result.pr_sizes)).toEqual(['alice', 'manager']);
	});

	it('applies independent toggles for the same developer across sections', () => {
		const data = make_data();
		const result = apply_visibility_filter(
			data,
			empty_hidden({ pr_sizes: ['manager'], contributor_stats: ['manager'] })
		);

		expect(Object.keys(result.pr_sizes)).toEqual(['alice']);
		expect(result.pr_contributor_stats.map((s) => s.author)).toEqual(['alice']);
	});

	it('does not mutate the input data', () => {
		const data = make_data();
		apply_visibility_filter(data, empty_hidden({ reviews: ['bob'], pr_sizes: ['manager'] }));

		expect(Object.keys(data.data)).toEqual(['alice', 'bob']);
		expect(Object.keys(data.pr_sizes)).toEqual(['alice', 'manager']);
		expect(data.pr_contributor_stats.map((s) => s.author)).toEqual(['alice', 'manager']);
	});

	it('shallow-filters: surviving values keep their original references', () => {
		const data = make_data();
		const result = apply_visibility_filter(data, empty_hidden({ reviews: ['bob'] }));

		expect(result.reviewer_stats['alice']).toBe(data.reviewer_stats['alice']);
		expect(result.pr_sizes['alice']).toBe(data.pr_sizes['alice']);
		expect(result.pr_contributor_stats[0]).toBe(data.pr_contributor_stats[0]);
	});
});

describe('list_dashboard_developers', () => {
	it('returns the sorted union of developers with their section membership', () => {
		const developers = list_dashboard_developers(make_data());

		expect(developers.map((d) => d.login)).toEqual(['alice', 'bob', 'manager']);

		const alice = developers.find((d) => d.login === 'alice')!;
		expect(alice).toMatchObject({
			in_reviews: true,
			in_pr_sizes: true,
			in_contributor_stats: true
		});

		const bob = developers.find((d) => d.login === 'bob')!;
		expect(bob).toMatchObject({
			in_reviews: true,
			in_pr_sizes: false,
			in_contributor_stats: false
		});

		const manager = developers.find((d) => d.login === 'manager')!;
		expect(manager).toMatchObject({
			in_reviews: false,
			in_pr_sizes: true,
			in_contributor_stats: true
		});
	});

	it('treats reviewer-stats-only developers as appearing in reviews', () => {
		const data = make_data({
			data: {},
			reviewer_stats: {
				carol: {
					reviewer: 'carol',
					total_prs_reviewed: 1,
					total_review_comments: 1,
					avg_comments_per_pr: 1
				}
			}
		});

		const carol = list_dashboard_developers(data).find((d) => d.login === 'carol')!;
		expect(carol.in_reviews).toBe(true);
	});
});

describe('DeveloperVisibilityService', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('creates and returns a default file when none exists', async () => {
		vi.mocked(fs.existsSync).mockReturnValue(false);
		const write_spy = vi.mocked(fs.writeFileSync).mockImplementation(() => undefined);

		const service = new DeveloperVisibilityService();
		const result = await service.get_hidden();

		expect(result).toEqual({
			reviews: [],
			pr_sizes: [],
			contributor_stats: [],
			last_modified: null
		});
		expect(write_spy).toHaveBeenCalledOnce();
	});

	it('reads and normalizes an existing file', async () => {
		vi.mocked(fs.existsSync).mockReturnValue(true);
		vi.mocked(fs.readFileSync).mockReturnValue(
			JSON.stringify({
				reviews: ['bob', 'bob'],
				pr_sizes: ['manager'],
				contributor_stats: [],
				last_modified: '2025-12-23T00:00:00.000Z'
			})
		);

		const service = new DeveloperVisibilityService();
		const result = await service.get_hidden();

		// De-dupes
		expect(result.reviews).toEqual(['bob']);
		expect(result.pr_sizes).toEqual(['manager']);
		expect(result.last_modified).toBe('2025-12-23T00:00:00.000Z');
	});

	it('persists the full object and stamps last_modified on set_hidden', async () => {
		const write_spy = vi.mocked(fs.writeFileSync).mockImplementation(() => undefined);

		const service = new DeveloperVisibilityService();
		const result = await service.set_hidden({ reviews: ['bob'], pr_sizes: ['manager'] });

		expect(result.reviews).toEqual(['bob']);
		expect(result.pr_sizes).toEqual(['manager']);
		expect(result.contributor_stats).toEqual([]);
		expect(result.last_modified).not.toBeNull();

		const written = JSON.parse(vi.mocked(write_spy).mock.calls[0][1] as string);
		expect(written.reviews).toEqual(['bob']);
	});

	it('ignores non-string values when normalizing', async () => {
		vi.mocked(fs.writeFileSync).mockImplementation(() => undefined);

		const service = new DeveloperVisibilityService();
		// @ts-expect-error testing runtime hardening against bad input
		const result = await service.set_hidden({ reviews: ['bob', 42, null] });

		expect(result.reviews).toEqual(['bob']);
	});
});
