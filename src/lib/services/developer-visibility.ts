import fs from 'fs';
import { Logger } from './logger';
import type { ICodeReviewsData, IDeveloperVisibility } from '../../types';

export type VisibilitySection = 'reviews' | 'pr_sizes' | 'contributor_stats';

const SECTIONS: VisibilitySection[] = ['reviews', 'pr_sizes', 'contributor_stats'];

export class DeveloperVisibilityService {
	// Resolved relative to process.cwd() — the server must run from the project
	// root, matching ExclusionsService and CodeReviewsService.
	private file_name = 'hidden-developers.json';

	public async get_hidden(): Promise<IDeveloperVisibility> {
		try {
			if (fs.existsSync(this.file_name)) {
				const data = JSON.parse(fs.readFileSync(this.file_name, 'utf8'));
				return this.normalize(data);
			} else {
				const initial_data = this.empty();
				fs.writeFileSync(this.file_name, JSON.stringify(initial_data));
				return initial_data;
			}
		} catch (error: unknown) {
			Logger.error(error);
			throw error;
		}
	}

	public async set_hidden(data: Partial<IDeveloperVisibility>): Promise<IDeveloperVisibility> {
		try {
			const normalized = this.normalize(data);
			normalized.last_modified = new Date().toISOString();
			fs.writeFileSync(this.file_name, JSON.stringify(normalized));
			return normalized;
		} catch (error: unknown) {
			Logger.error(error);
			throw error;
		}
	}

	private empty(): IDeveloperVisibility {
		return {
			reviews: [],
			pr_sizes: [],
			contributor_stats: [],
			last_modified: null
		};
	}

	private normalize(data: Partial<IDeveloperVisibility> | null): IDeveloperVisibility {
		const result = this.empty();
		if (!data) return result;

		for (const section of SECTIONS) {
			const value = data[section];
			if (Array.isArray(value)) {
				// De-dupe and keep only strings
				result[section] = [...new Set(value.filter((v): v is string => typeof v === 'string'))];
			}
		}

		if (typeof data.last_modified === 'string') {
			result.last_modified = data.last_modified;
		}

		return result;
	}
}

/**
 * Returns a copy of the synced code-review data with hidden developers stripped
 * from each dashboard section. Pure function — does not mutate its inputs.
 *
 * - `hidden.reviews` removes reviewers from the Code Reviews grid (`data` and
 *   `reviewer_stats`).
 * - `hidden.pr_sizes` removes authors from the Average PR Size table (`pr_sizes`).
 * - `hidden.contributor_stats` removes authors from the Contributor Statistics
 *   section (`pr_contributor_stats`).
 */
export const apply_visibility_filter = (
	data: ICodeReviewsData,
	hidden: IDeveloperVisibility
): ICodeReviewsData => {
	const hidden_reviews = new Set(hidden.reviews);
	const hidden_pr_sizes = new Set(hidden.pr_sizes);
	const hidden_contributor_stats = new Set(hidden.contributor_stats);

	const filter_record = <T>(
		record: Record<string, T>,
		hidden_set: Set<string>
	): Record<string, T> => {
		return Object.fromEntries(
			Object.entries(record ?? {}).filter(([login]) => !hidden_set.has(login))
		);
	};

	return {
		...data,
		data: filter_record(data.data, hidden_reviews),
		reviewer_stats: filter_record(data.reviewer_stats, hidden_reviews),
		pr_sizes: filter_record(data.pr_sizes, hidden_pr_sizes),
		pr_contributor_stats: (data.pr_contributor_stats ?? []).filter(
			(stats) => !hidden_contributor_stats.has(stats.author)
		)
	};
};

/**
 * Builds the list of developers known to the dashboard, noting which sections
 * each appears in. Used to render the settings page checkboxes.
 */
export const list_dashboard_developers = (
	data: ICodeReviewsData
): {
	login: string;
	in_reviews: boolean;
	in_pr_sizes: boolean;
	in_contributor_stats: boolean;
}[] => {
	const reviews = new Set(Object.keys(data.data ?? {}));
	const reviewer_stats = new Set(Object.keys(data.reviewer_stats ?? {}));
	const pr_sizes = new Set(Object.keys(data.pr_sizes ?? {}));
	const contributor_stats = new Set((data.pr_contributor_stats ?? []).map((stats) => stats.author));

	const all_logins = new Set<string>([
		...reviews,
		...reviewer_stats,
		...pr_sizes,
		...contributor_stats
	]);

	return [...all_logins]
		.sort((a, b) => a.localeCompare(b))
		.map((login) => ({
			login,
			in_reviews: reviews.has(login) || reviewer_stats.has(login),
			in_pr_sizes: pr_sizes.has(login),
			in_contributor_stats: contributor_stats.has(login)
		}));
};
