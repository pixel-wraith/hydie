export type Status = 'not-synced' | 'synced' | 'syncing' | 'error' | null;

export interface IPRSizeStats {
	min: number;
	max: number;
	avg: number;
	pr_count: number;
}

export interface IPullRequestInfo {
	number: number;
	title: string;
	html_url: string;
	author: string;
	additions: number;
	deletions: number;
	created_at: string;
	merged_at: string | null;
	state: 'open' | 'closed';
	review_comments_count: number;
}

export interface IPRContributorStats {
	author: string;
	prs_by_date: Record<string, number>;
	prs: IPRDetail[];
	avg_days_to_merge: number | null;
	avg_review_comments: number;
	total_prs: number;
}

export interface IPRDetail {
	number: number;
	title: string;
	html_url: string;
	created_at: string;
	merged_at: string | null;
	state: 'open' | 'closed';
	days_to_merge: number | null;
	review_comments_count: number;
}

export interface IReviewerStats {
	reviewer: string;
	total_prs_reviewed: number;
	total_review_comments: number;
	avg_comments_per_pr: number;
	// Distinct PR numbers this reviewer reviewed (excluding self-reviews). Used to
	// compute a team-wide distinct count. Optional for backwards compatibility with
	// data.json files written before this field existed; the team-stats calculation
	// falls back to summing total_prs_reviewed when it is absent.
	reviewed_pr_numbers?: number[];
}

export interface IReviewComment {
	id: number;
	pr_number: number;
	pr_title: string;
	pr_url: string;
	author: string;
	body: string;
	path: string;
	line: number | null;
	created_at: string;
	html_url: string;
}

export interface IExcludedPRs {
	excluded: number[];
	last_modified: string | null;
}

export interface IDeveloperVisibility {
	reviews: string[];
	pr_sizes: string[];
	contributor_stats: string[];
	last_modified: string | null;
}

export interface ICodeReviewsData {
	last_synced: string | null;
	status: Status;
	data: Record<string, Record<string, number>>;
	pr_sizes: Record<string, IPRSizeStats>;
	pull_requests: IPullRequestInfo[];
	pr_contributor_stats: IPRContributorStats[];
	reviewer_stats: Record<string, IReviewerStats>;
	review_comments: IReviewComment[];
}

// A single team-level scorecard value. `value` is null when there is no data to
// compute it from (an empty/hidden section, or a zero per-PR denominator), which
// the UI renders dimmed rather than as a misleading 0.
export interface ITeamScore {
	value: number | null;
}

export interface ITeamStats {
	// Reviews section (scoped by the `reviews` visibility setting).
	avg_prs_reviewed: ITeamScore;
	total_prs_reviewed: ITeamScore;
	avg_comments_per_dev: ITeamScore;
	total_comments: ITeamScore;
	avg_comments_left_per_pr: ITeamScore;
	// PR Size section (scoped by the `pr_sizes` visibility setting).
	avg_pr_size: ITeamScore;
	// Contributions section (scoped by the `contributor_stats` visibility setting).
	total_prs: ITeamScore;
	avg_days_to_merge: ITeamScore;
	avg_comments_received_per_pr: ITeamScore;
}
