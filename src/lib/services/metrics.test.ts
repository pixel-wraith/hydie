import { describe, it, expect } from 'vitest';
import {
	is_bot_user,
	is_closed_unmerged,
	is_counted_review,
	is_counted_comment,
	days_to_merge,
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

// A 14-day window, June 1–14 2026. Out-of-window dates sit before June 1.
const DATES = [
	'2026-06-01',
	'2026-06-02',
	'2026-06-03',
	'2026-06-04',
	'2026-06-05',
	'2026-06-06',
	'2026-06-07',
	'2026-06-08',
	'2026-06-09',
	'2026-06-10',
	'2026-06-11',
	'2026-06-12',
	'2026-06-13',
	'2026-06-14'
];
const IN = '2026-06-10T12:00:00Z';
const OUT = '2026-05-20T12:00:00Z'; // before the window

function review(over: Partial<ReviewRecord> = {}): ReviewRecord {
	return {
		pr_number: 1,
		pr_author: 'author',
		reviewer: 'reviewer',
		reviewer_is_bot: false,
		state: 'APPROVED',
		submitted_at: IN,
		...over
	};
}

function comment(over: Partial<CommentRecord> = {}): CommentRecord {
	return {
		pr_number: 1,
		pr_author: 'author',
		author: 'commenter',
		author_is_bot: false,
		created_at: IN,
		...over
	};
}

function pr(over: Partial<PullRequestRecord> = {}): PullRequestRecord {
	return {
		number: 1,
		author: 'author',
		author_is_bot: false,
		title: 'PR',
		html_url: 'https://example.com/1',
		additions: 10,
		deletions: 5,
		created_at: IN,
		merged_at: null,
		state: 'open',
		...over
	};
}

describe('is_bot_user', () => {
	it('flags accounts with type Bot', () => {
		expect(is_bot_user({ login: 'sentry-io', type: 'Bot' })).toBe(true);
	});
	it('flags [bot]-suffixed logins as a fallback', () => {
		expect(is_bot_user({ login: 'coderabbitai[bot]', type: undefined })).toBe(true);
	});
	it('does not flag normal users', () => {
		expect(is_bot_user({ login: 'jake-lundberg', type: 'User' })).toBe(false);
	});
	it('handles null safely', () => {
		expect(is_bot_user(null)).toBe(false);
	});
});

describe('is_closed_unmerged', () => {
	it('is true only for closed PRs with no merged_at', () => {
		expect(is_closed_unmerged({ state: 'closed', merged_at: null })).toBe(true);
		expect(is_closed_unmerged({ state: 'closed', merged_at: '2026-06-10T00:00:00Z' })).toBe(false);
		expect(is_closed_unmerged({ state: 'open', merged_at: null })).toBe(false);
	});
});

describe('is_counted_review', () => {
	it('counts a qualifying in-window non-self non-bot review', () => {
		expect(is_counted_review(review(), DATES)).toBe(true);
	});

	it('counts COMMENTED and CHANGES_REQUESTED, not DISMISSED or PENDING', () => {
		expect(is_counted_review(review({ state: 'COMMENTED' }), DATES)).toBe(true);
		expect(is_counted_review(review({ state: 'CHANGES_REQUESTED' }), DATES)).toBe(true);
		expect(is_counted_review(review({ state: 'DISMISSED' }), DATES)).toBe(false);
		expect(is_counted_review(review({ state: 'PENDING' }), DATES)).toBe(false);
	});

	it('excludes a review submitted outside the window even if its PR is recent', () => {
		// This is the core of the 255 bug: an old review on a still-active PR.
		expect(is_counted_review(review({ submitted_at: OUT }), DATES)).toBe(false);
	});

	it('counts an in-window review regardless of how old its PR is', () => {
		// The record carries no PR age, proving PR age cannot pull or push a review
		// in/out of the window — only the review's own submitted_at matters.
		expect(is_counted_review(review({ pr_number: 206, submitted_at: IN }), DATES)).toBe(true);
	});

	it('excludes self-reviews and bot reviews', () => {
		expect(is_counted_review(review({ reviewer: 'author' }), DATES)).toBe(false);
		expect(is_counted_review(review({ reviewer_is_bot: true }), DATES)).toBe(false);
	});
});

describe('is_counted_comment', () => {
	it('counts in-window non-self non-bot comments', () => {
		expect(is_counted_comment(comment(), DATES)).toBe(true);
	});
	it('excludes out-of-window, self, and bot comments', () => {
		expect(is_counted_comment(comment({ created_at: OUT }), DATES)).toBe(false);
		expect(is_counted_comment(comment({ author: 'author' }), DATES)).toBe(false);
		expect(is_counted_comment(comment({ author_is_bot: true }), DATES)).toBe(false);
	});
});

describe('days_to_merge', () => {
	it('returns whole days for a merged PR', () => {
		expect(
			days_to_merge({ created_at: '2026-06-01T00:00:00Z', merged_at: '2026-06-04T00:00:00Z' })
		).toBe(3);
	});
	it('returns null for an open (never-merged) PR', () => {
		expect(days_to_merge({ created_at: '2026-06-01T00:00:00Z', merged_at: null })).toBeNull();
	});
	it('rounds a sub-day merge up to 1, never 0', () => {
		expect(
			days_to_merge({ created_at: '2026-06-01T00:00:00Z', merged_at: '2026-06-01T00:00:05Z' })
		).toBe(1);
	});
});

describe('record_from_stored', () => {
	it('defaults author_is_bot to false when absent on older stored PRs', () => {
		const stored = {
			number: 1,
			title: 'PR',
			html_url: 'https://example.com/1',
			author: 'dev',
			additions: 10,
			deletions: 5,
			created_at: IN,
			merged_at: null,
			state: 'open' as const,
			review_comments_count: 0
		};
		expect(record_from_stored(stored).author_is_bot).toBe(false);
	});

	it('preserves author_is_bot when present', () => {
		const stored = {
			number: 2,
			title: 'PR',
			html_url: 'https://example.com/2',
			author: 'sentry[bot]',
			author_is_bot: true,
			additions: 1,
			deletions: 1,
			created_at: IN,
			merged_at: null,
			state: 'open' as const,
			review_comments_count: 0
		};
		expect(record_from_stored(stored).author_is_bot).toBe(true);
	});
});

describe('count_reviews_per_day', () => {
	it('counts review EVENTS per day, so re-reviewing one PR three times in a day is 3', () => {
		const reviews = [
			review({ submitted_at: '2026-06-10T09:00:00Z' }),
			review({ submitted_at: '2026-06-10T10:00:00Z' }),
			review({ submitted_at: '2026-06-10T11:00:00Z' })
		];
		const grid = count_reviews_per_day(reviews, DATES);
		expect(grid['reviewer']['2026-06-10']).toBe(3);
	});

	it('omits out-of-window, dismissed, self, and bot reviews from the grid', () => {
		const reviews = [
			review({ submitted_at: OUT }),
			review({ state: 'DISMISSED' }),
			review({ reviewer: 'author' }),
			review({ reviewer_is_bot: true })
		];
		expect(count_reviews_per_day(reviews, DATES)).toEqual({});
	});
});

describe('calculate_reviewer_stats', () => {
	it('counts DISTINCT PRs reviewed, so re-reviewing one PR is 1', () => {
		const reviews = [
			review({ pr_number: 5, submitted_at: '2026-06-10T09:00:00Z' }),
			review({ pr_number: 5, submitted_at: '2026-06-11T09:00:00Z' })
		];
		const stats = calculate_reviewer_stats(reviews, [], DATES);
		expect(stats['reviewer'].total_prs_reviewed).toBe(1);
		expect(stats['reviewer'].reviewed_pr_numbers).toEqual([5]);
	});

	it('counts qualifying comments and derives avg comments per PR', () => {
		const reviews = [review({ pr_number: 1 }), review({ pr_number: 2 })];
		const comments = [
			comment({ author: 'reviewer', pr_number: 1 }),
			comment({ author: 'reviewer', pr_number: 1 }),
			comment({ author: 'reviewer', pr_number: 2 })
		];
		const stats = calculate_reviewer_stats(reviews, comments, DATES);
		expect(stats['reviewer'].total_prs_reviewed).toBe(2);
		expect(stats['reviewer'].total_review_comments).toBe(3);
		expect(stats['reviewer'].avg_comments_per_pr).toBe(1.5);
	});

	it('excludes all activity from bots and out-of-window events', () => {
		const reviews = [
			review({ reviewer: 'sentry[bot]', reviewer_is_bot: true }),
			review({ reviewer: 'human', submitted_at: OUT })
		];
		expect(calculate_reviewer_stats(reviews, [], DATES)).toEqual({});
	});
});

describe('calculate_pr_sizes', () => {
	it('aggregates size only over PRs created in the window', () => {
		const prs = [
			pr({
				number: 1,
				author: 'dev',
				additions: 100,
				deletions: 0,
				created_at: '2026-06-05T00:00:00Z'
			}),
			pr({
				number: 2,
				author: 'dev',
				additions: 50,
				deletions: 50,
				created_at: '2026-06-06T00:00:00Z'
			}),
			// created before the window — must be ignored
			pr({ number: 3, author: 'dev', additions: 999, deletions: 0, created_at: OUT })
		];
		const sizes = calculate_pr_sizes(prs, new Set(), DATES);
		expect(sizes['dev']).toEqual({ min: 100, max: 100, avg: 100, pr_count: 2 });
	});

	it('excludes closed-unmerged, excluded, and bot-authored PRs', () => {
		const prs = [
			pr({ number: 1, author: 'dev', state: 'closed', merged_at: null }), // closed-unmerged
			pr({ number: 2, author: 'dev' }), // excluded by id
			pr({ number: 3, author: 'bot', author_is_bot: true })
		];
		expect(calculate_pr_sizes(prs, new Set([2]), DATES)).toEqual({});
	});
});

describe('calculate_contributor_stats', () => {
	it('averages days-to-merge over merged PRs only, excluding open PRs', () => {
		const prs = [
			pr({
				number: 1,
				author: 'dev',
				state: 'closed',
				created_at: '2026-06-01T00:00:00Z',
				merged_at: '2026-06-05T00:00:00Z' // 4 days
			}),
			pr({
				number: 2,
				author: 'dev',
				state: 'closed',
				created_at: '2026-06-02T00:00:00Z',
				merged_at: '2026-06-04T00:00:00Z' // 2 days
			}),
			// open PR created in window — counts toward total_prs but NOT days-to-merge
			pr({ number: 3, author: 'dev', state: 'open', created_at: '2026-06-01T00:00:00Z' })
		];
		const [stats] = calculate_contributor_stats(prs, new Map(), new Set(), DATES);
		expect(stats.total_prs).toBe(3);
		expect(stats.avg_days_to_merge).toBe(3); // (4 + 2) / 2, open PR not averaged in
		expect(stats.prs.find((p) => p.number === 3)!.days_to_merge).toBeNull();
	});

	it('counts comments received per PR from qualifying comments only', () => {
		const prs = [pr({ number: 7, author: 'dev', created_at: '2026-06-05T00:00:00Z' })];
		const comments = [
			comment({ pr_number: 7, pr_author: 'dev', author: 'reviewer' }),
			comment({ pr_number: 7, pr_author: 'dev', author: 'reviewer' }),
			comment({ pr_number: 7, pr_author: 'dev', author: 'dev' }), // self — excluded
			comment({ pr_number: 7, pr_author: 'dev', author: 'bot', author_is_bot: true }) // bot — excluded
		];
		const counts = count_comments_by_pr(comments, DATES);
		expect(counts.get(7)).toBe(2);
		const [stats] = calculate_contributor_stats(prs, counts, new Set(), DATES);
		expect(stats.prs[0].review_comments_count).toBe(2);
		expect(stats.avg_review_comments).toBe(2);
	});

	it('buckets PRs by their creation date', () => {
		const prs = [
			pr({ number: 1, author: 'dev', created_at: '2026-06-05T08:00:00Z' }),
			pr({ number: 2, author: 'dev', created_at: '2026-06-05T20:00:00Z' })
		];
		const [stats] = calculate_contributor_stats(prs, new Map(), new Set(), DATES);
		expect(stats.prs_by_date['2026-06-05']).toBe(2);
	});
});
