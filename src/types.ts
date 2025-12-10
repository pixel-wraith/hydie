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
}
