export type Status = 'not-synced' | 'synced' | 'syncing' | 'error' | null;

export interface ICodeReviewsData {
	last_synced: string | null;
	status: Status;
	data: Record<string, Record<string, number>>;
}
