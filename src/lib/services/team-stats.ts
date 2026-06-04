import type { ICodeReviewsData, ITeamStats, ITeamScore } from '../../types';

const round1 = (n: number): number => Math.round(n * 10) / 10;

const score = (value: number | null, approximate = false): ITeamScore =>
	approximate ? { value, approximate: true } : { value };

/**
 * Computes the team-level scorecards shown at the top of the dashboard.
 *
 * Pure function — does not mutate its input. It expects data that has ALREADY
 * had the developer-visibility filter applied, so each metric is implicitly
 * scoped to the developers currently visible in its section:
 *
 * - Reviews metrics derive from `reviewer_stats` (the `reviews` section).
 * - PR-size metric derives from `pr_sizes` (the `pr_sizes` section).
 * - Contribution metrics derive from `pr_contributor_stats` (the
 *   `contributor_stats` section).
 *
 * "per dev" metrics are macro-averages (each developer weighted equally);
 * "per PR" metrics are micro-averages (each PR weighted equally) — except
 * avg_pr_size, which is deliberately the mean of the displayed devs' per-dev
 * averages so every visible developer counts equally regardless of PR volume.
 * A metric is `null` when there is no data to compute it from, which the UI
 * renders dimmed rather than as a misleading 0.
 */
export const calculate_team_stats = (data: ICodeReviewsData): ITeamStats => {
	const reviewers = Object.values(data.reviewer_stats ?? {});
	const pr_sizes = Object.values(data.pr_sizes ?? {});
	const contributors = data.pr_contributor_stats ?? [];

	// --- Reviews section ---
	const reviewer_count = reviewers.length;
	const total_comments = reviewers.reduce((sum, r) => sum + r.total_review_comments, 0);
	const sum_prs_reviewed = reviewers.reduce((sum, r) => sum + r.total_prs_reviewed, 0);

	const avg_prs_reviewed = reviewer_count > 0 ? round1(sum_prs_reviewed / reviewer_count) : null;
	const avg_comments_per_dev = reviewer_count > 0 ? round1(total_comments / reviewer_count) : null;

	// Distinct PRs reviewed: union of each visible reviewer's reviewed PR numbers.
	// Falls back to the sum of per-reviewer counts when the field is absent (data
	// written before reviewed_pr_numbers existed); that sum may over-count PRs
	// reviewed by more than one person, so the result is flagged approximate until
	// a re-sync produces the exact value.
	let total_prs_reviewed: number | null;
	let prs_reviewed_approximate = false;
	if (reviewer_count === 0) {
		total_prs_reviewed = null;
	} else if (reviewers.every((r) => Array.isArray(r.reviewed_pr_numbers))) {
		const distinct = new Set<number>();
		for (const r of reviewers) {
			for (const n of r.reviewed_pr_numbers!) distinct.add(n);
		}
		total_prs_reviewed = distinct.size;
	} else {
		total_prs_reviewed = sum_prs_reviewed;
		prs_reviewed_approximate = true;
	}

	// Micro: total comments left across the team ÷ distinct PRs reviewed.
	const avg_comments_left_per_pr =
		total_prs_reviewed && total_prs_reviewed > 0
			? round1(total_comments / total_prs_reviewed)
			: null;

	// --- PR Size section (macro: mean of the visible devs' per-dev averages, so
	// every displayed developer counts equally regardless of PR volume) ---
	const sum_dev_avg_sizes = pr_sizes.reduce((sum, s) => sum + s.avg, 0);
	const avg_pr_size = pr_sizes.length > 0 ? Math.round(sum_dev_avg_sizes / pr_sizes.length) : null;

	// --- Contributions section ---
	const sum_total_prs = contributors.reduce((sum, c) => sum + c.total_prs, 0);

	// Micro: mean days-to-merge over every merged PR (open PRs have a null
	// days_to_merge and are naturally excluded from the denominator).
	let merge_days_sum = 0;
	let merged_count = 0;
	let received_comments = 0;
	for (const c of contributors) {
		for (const pr of c.prs) {
			received_comments += pr.review_comments_count;
			if (pr.days_to_merge !== null) {
				merge_days_sum += pr.days_to_merge;
				merged_count++;
			}
		}
	}
	const avg_days_to_merge = merged_count > 0 ? round1(merge_days_sum / merged_count) : null;
	const avg_comments_received_per_pr =
		sum_total_prs > 0 ? round1(received_comments / sum_total_prs) : null;

	return {
		avg_prs_reviewed: score(avg_prs_reviewed),
		total_prs_reviewed: score(total_prs_reviewed, prs_reviewed_approximate),
		avg_comments_per_dev: score(avg_comments_per_dev),
		total_comments: score(reviewer_count > 0 ? total_comments : null),
		// Divides by the (possibly over-counted) distinct PR total, so it inherits
		// the same approximation.
		avg_comments_left_per_pr: score(avg_comments_left_per_pr, prs_reviewed_approximate),
		avg_pr_size: score(avg_pr_size),
		total_prs: score(contributors.length > 0 ? sum_total_prs : null),
		avg_days_to_merge: score(avg_days_to_merge),
		avg_comments_received_per_pr: score(avg_comments_received_per_pr)
	};
};
