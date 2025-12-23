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
}

export interface IExcludedPRs {
	excluded: number[];
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
}
