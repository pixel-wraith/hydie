export type Status = 'not-synced' | 'synced' | 'syncing' | 'error' | null;

export interface IPRSizeStats {
	min: number;
	max: number;
	avg: number;
	pr_count: number;
}

export interface ICodeReviewsData {
	last_synced: string | null;
	status: Status;
	data: Record<string, Record<string, number>>;
	pr_sizes: Record<string, IPRSizeStats>;
}
