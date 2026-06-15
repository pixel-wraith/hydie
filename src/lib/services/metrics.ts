import type {
	IPRSizeStats,
	IPullRequestInfo,
	IPRContributorStats,
	IReviewerStats
} from '../../types';

/**
 * Pure dashboard-metric aggregation.
 *
 * These functions take already-fetched, normalized records plus the date window
 * and return the shapes the dashboard renders. They are the single source of
 * truth for what each metric means, and contain NO GitHub/Octokit/filesystem
 * dependencies so they can be unit-tested in isolation.
 *
 * Canonical definitions (see issue #6):
 * - Windowing is by EVENT date: a review counts when its `submitted_at` falls in
 *   the window; a comment when its `created_at` does. A PR's own age never pulls
 *   historical activity into the window.
 * - A "review" is a submitted review whose state is APPROVED, CHANGES_REQUESTED,
 *   or COMMENTED. DISMISSED and PENDING do not count. This applies to both the
 *   daily grid (review events) and the distinct-PRs-reviewed column.
 * - "Comments" are inline review (diff) comments only.
 * - Self-reviews and self-comments (actor == PR author) are excluded everywhere.
 * - Bots are excluded from every metric by default.
 * - Avg days-to-merge is over merged PRs only; open PRs are never averaged in.
 * - PR sizes and contributor "total PRs" both measure PRs CREATED in the window.
 */

/** Review states that count as having reviewed a PR. */
export const QUALIFYING_REVIEW_STATES = new Set(['APPROVED', 'CHANGES_REQUESTED', 'COMMENTED']);

/** A normalized review event (one submitted GitHub review). */
export interface ReviewRecord {
	pr_number: number;
	pr_author: string;
	reviewer: string;
	reviewer_is_bot: boolean;
	state: string;
	submitted_at: string | null;
}

/** A normalized inline review comment. */
export interface CommentRecord {
	pr_number: number;
	pr_author: string;
	author: string;
	author_is_bot: boolean;
	created_at: string;
}

/** A normalized pull request with the fields every metric needs. */
export interface PullRequestRecord {
	number: number;
	author: string;
	author_is_bot: boolean;
	title: string;
	html_url: string;
	additions: number;
	deletions: number;
	created_at: string;
	merged_at: string | null;
	state: 'open' | 'closed';
}

/**
 * A PR closed without being merged. A merged PR is also state 'closed' but
 * carries a merged_at timestamp; one closed without merging has none. These
 * never merged and must not count toward any metric.
 */
export function is_closed_unmerged(pr: { state: string; merged_at: string | null }): boolean {
	return pr.state === 'closed' && !pr.merged_at;
}

/**
 * Whether a GitHub user is a bot. GitHub sets `type: 'Bot'` on bot accounts;
 * the `[bot]` login suffix is a defensive fallback for any payload missing it.
 */
export function is_bot_user(user: { login?: string | null; type?: string | null } | null): boolean {
	if (!user) return false;
	if (user.type === 'Bot') return true;
	return /\[bot\]$/i.test(user.login ?? '');
}

/**
 * Inclusive YYYY-MM-DD comparison of an ISO timestamp against the window edges.
 * `dates` is assumed to be a consecutive, ascending run of days (as produced by
 * the service's get_date_range), so a range check against the first/last entry
 * is equivalent to set membership and avoids per-call Set construction.
 */
function date_in_window(iso: string | null, dates: string[]): boolean {
	if (!iso || dates.length === 0) return false;
	const day = iso.split('T')[0];
	return day >= dates[0] && day <= dates[dates.length - 1];
}

/**
 * The window of YYYY-MM-DD day strings ending today, oldest first. `now` is
 * injectable so the window is deterministic in tests.
 */
export function get_date_range(numberOfDays = 14, now: Date = new Date()): string[] {
	const dates: string[] = [];
	for (let i = 0; i < numberOfDays; i++) {
		const date = new Date(now);
		date.setDate(date.getDate() - i);
		dates.unshift(date.toISOString().split('T')[0]);
	}
	return dates;
}

/**
 * PRs created within the window, authored by a human. This is the set the
 * contributors view should show — matching the dashboard's "PRs created in the
 * window" definition — rather than every PR merely *updated* in the window
 * (which drags in ancient PRs that received recent activity). Excluded PRs are
 * intentionally kept so the contributors view can still display/toggle them.
 */
export function prs_created_in_window<T extends { created_at: string; author_is_bot?: boolean }>(
	prs: T[],
	dates: string[]
): T[] {
	if (dates.length === 0) return [];
	return prs.filter((pr) => {
		if (pr.author_is_bot) return false;
		const created = pr.created_at.split('T')[0];
		return created >= dates[0] && created <= dates[dates.length - 1];
	});
}

/** A review that counts: qualifying state, in window, not a self-review, not a bot. */
export function is_counted_review(review: ReviewRecord, dates: string[]): boolean {
	return (
		QUALIFYING_REVIEW_STATES.has(review.state) &&
		date_in_window(review.submitted_at, dates) &&
		review.reviewer !== review.pr_author &&
		!review.reviewer_is_bot
	);
}

/** A comment that counts: in window, not a self-comment, not a bot. */
export function is_counted_comment(comment: CommentRecord, dates: string[]): boolean {
	return (
		date_in_window(comment.created_at, dates) &&
		comment.author !== comment.pr_author &&
		!comment.author_is_bot
	);
}

/**
 * Days between creation and merge for a merged PR; null for anything not merged.
 * Rounds UP to whole days, so any PR merged within its first 24 hours counts as
 * 1 day (never 0) — a same-hour merge still represents a day's worth of cycle.
 */
export function days_to_merge(pr: { created_at: string; merged_at: string | null }): number | null {
	if (!pr.merged_at) return null;
	const created = new Date(pr.created_at).getTime();
	const merged = new Date(pr.merged_at).getTime();
	return Math.ceil((merged - created) / (1000 * 60 * 60 * 24));
}

/**
 * Daily review grid: count of qualifying review EVENTS per reviewer per day.
 * Re-reviewing the same PR multiple times in a day counts each event.
 */
export function count_reviews_per_day(
	reviews: ReviewRecord[],
	dates: string[]
): Record<string, Record<string, number>> {
	const result: Record<string, Record<string, number>> = {};

	for (const review of reviews) {
		if (!is_counted_review(review, dates)) continue;

		const day = review.submitted_at!.split('T')[0];
		if (!result[review.reviewer]) {
			result[review.reviewer] = {};
			dates.forEach((d) => (result[review.reviewer][d] = 0));
		}
		result[review.reviewer][day]++;
	}

	return result;
}

/**
 * Per-reviewer stats: DISTINCT PRs reviewed (qualifying reviews in window) and
 * the count of qualifying inline comments left. Keyed by reviewer login.
 */
export function calculate_reviewer_stats(
	reviews: ReviewRecord[],
	comments: CommentRecord[],
	dates: string[]
): Record<string, IReviewerStats> {
	const reviewer_prs = new Map<string, Set<number>>();
	for (const review of reviews) {
		if (!is_counted_review(review, dates)) continue;
		if (!reviewer_prs.has(review.reviewer)) reviewer_prs.set(review.reviewer, new Set());
		reviewer_prs.get(review.reviewer)!.add(review.pr_number);
	}

	const reviewer_comments = new Map<string, number>();
	for (const comment of comments) {
		if (!is_counted_comment(comment, dates)) continue;
		reviewer_comments.set(comment.author, (reviewer_comments.get(comment.author) ?? 0) + 1);
	}

	const result: Record<string, IReviewerStats> = {};
	const all_reviewers = new Set([...reviewer_prs.keys(), ...reviewer_comments.keys()]);

	for (const reviewer of all_reviewers) {
		const reviewed_prs = reviewer_prs.get(reviewer);
		const prs_reviewed = reviewed_prs?.size ?? 0;
		const total_comments = reviewer_comments.get(reviewer) ?? 0;

		result[reviewer] = {
			reviewer,
			total_prs_reviewed: prs_reviewed,
			total_review_comments: total_comments,
			avg_comments_per_pr:
				prs_reviewed > 0 ? Math.round((total_comments / prs_reviewed) * 10) / 10 : 0,
			reviewed_pr_numbers: reviewed_prs ? [...reviewed_prs] : []
		};
	}

	return result;
}

/** PRs created in the window that count toward contribution metrics. */
function contribution_prs(
	prs: PullRequestRecord[],
	excluded: Set<number>,
	dates: string[]
): PullRequestRecord[] {
	return prs.filter((pr) => {
		if (is_closed_unmerged(pr)) return false;
		if (excluded.has(pr.number)) return false;
		if (pr.author_is_bot) return false;
		const created = pr.created_at.split('T')[0];
		return created >= dates[0] && created <= dates[dates.length - 1];
	});
}

/**
 * Per-author PR size stats over PRs CREATED in the window (excluding
 * closed-unmerged, excluded, and bot-authored PRs).
 */
export function calculate_pr_sizes(
	prs: PullRequestRecord[],
	excluded: Set<number>,
	dates: string[]
): Record<string, IPRSizeStats> {
	const sizes_by_author: Record<string, number[]> = {};

	for (const pr of contribution_prs(prs, excluded, dates)) {
		const size = pr.additions + pr.deletions;
		if (!sizes_by_author[pr.author]) sizes_by_author[pr.author] = [];
		sizes_by_author[pr.author].push(size);
	}

	const result: Record<string, IPRSizeStats> = {};
	for (const [author, sizes] of Object.entries(sizes_by_author)) {
		if (sizes.length === 0) continue;
		result[author] = {
			min: Math.min(...sizes),
			max: Math.max(...sizes),
			avg: Math.round(sizes.reduce((sum, s) => sum + s, 0) / sizes.length),
			pr_count: sizes.length
		};
	}

	return result;
}

/**
 * Qualifying inline comments grouped by the PR they were left on. Used both at
 * sync time (from raw comments) and as the input the contributor-stats assembly
 * consumes, so the recalculate path can supply already-stored per-PR counts.
 */
export function count_comments_by_pr(
	comments: CommentRecord[],
	dates: string[]
): Map<number, number> {
	const comments_by_pr = new Map<number, number>();
	for (const comment of comments) {
		if (!is_counted_comment(comment, dates)) continue;
		comments_by_pr.set(comment.pr_number, (comments_by_pr.get(comment.pr_number) ?? 0) + 1);
	}
	return comments_by_pr;
}

/**
 * Per-author contribution stats over PRs CREATED in the window. Days-to-merge is
 * computed for merged PRs only (open PRs contribute null and are excluded from
 * the average). `comments_by_pr` is the qualifying comments-received count per PR
 * (build it with `count_comments_by_pr`).
 */
export function calculate_contributor_stats(
	prs: PullRequestRecord[],
	comments_by_pr: Map<number, number>,
	excluded: Set<number>,
	dates: string[]
): IPRContributorStats[] {
	const stats_by_author = new Map<string, IPRContributorStats>();

	for (const pr of contribution_prs(prs, excluded, dates)) {
		if (!stats_by_author.has(pr.author)) {
			const prs_by_date: Record<string, number> = {};
			dates.forEach((d) => (prs_by_date[d] = 0));
			stats_by_author.set(pr.author, {
				author: pr.author,
				prs_by_date,
				prs: [],
				avg_days_to_merge: null,
				avg_review_comments: 0,
				total_prs: 0
			});
		}

		const stats = stats_by_author.get(pr.author)!;
		const created_date = pr.created_at.split('T')[0];
		if (stats.prs_by_date[created_date] !== undefined) stats.prs_by_date[created_date]++;

		const review_comments_count = comments_by_pr.get(pr.number) ?? 0;
		stats.prs.push({
			number: pr.number,
			title: pr.title,
			html_url: pr.html_url,
			created_at: pr.created_at,
			merged_at: pr.merged_at,
			state: pr.state,
			days_to_merge: days_to_merge(pr),
			review_comments_count
		});
		stats.total_prs++;
	}

	for (const stats of stats_by_author.values()) {
		const merged = stats.prs.filter((pr) => pr.days_to_merge !== null);
		if (merged.length > 0) {
			const total_days = merged.reduce((sum, pr) => sum + (pr.days_to_merge ?? 0), 0);
			stats.avg_days_to_merge = Math.round((total_days / merged.length) * 10) / 10;
		}

		const total_comments = stats.prs.reduce((sum, pr) => sum + pr.review_comments_count, 0);
		stats.avg_review_comments =
			stats.prs.length > 0 ? Math.round((total_comments / stats.prs.length) * 10) / 10 : 0;
	}

	return Array.from(stats_by_author.values()).sort((a, b) => b.total_prs - a.total_prs);
}

/** Convert a stored PR (used by the recalculate path) to a metrics record. */
export function record_from_stored(pr: IPullRequestInfo): PullRequestRecord {
	return {
		number: pr.number,
		author: pr.author,
		author_is_bot: pr.author_is_bot ?? false,
		title: pr.title,
		html_url: pr.html_url,
		additions: pr.additions,
		deletions: pr.deletions,
		created_at: pr.created_at,
		merged_at: pr.merged_at,
		state: pr.state
	};
}
