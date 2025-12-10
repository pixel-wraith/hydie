import fs from 'fs';
import { Logger } from './logger';
import type { IExcludedPRs } from '../../types';

export class ExclusionsService {
	private file_name = 'excluded-prs.json';

	public async get_excluded_prs(): Promise<IExcludedPRs> {
		try {
			if (fs.existsSync(this.file_name)) {
				const data = JSON.parse(fs.readFileSync(this.file_name, 'utf8'));
				return data;
			} else {
				const initial_data: IExcludedPRs = {
					excluded: [],
					last_modified: null
				};
				fs.writeFileSync(this.file_name, JSON.stringify(initial_data));
				return initial_data;
			}
		} catch (error: unknown) {
			Logger.error(error);
			throw error;
		}
	}

	public async toggle_exclusion(pr_number: number): Promise<IExcludedPRs> {
		try {
			const data = await this.get_excluded_prs();

			const index = data.excluded.indexOf(pr_number);
			if (index === -1) {
				data.excluded.push(pr_number);
			} else {
				data.excluded.splice(index, 1);
			}

			data.last_modified = new Date().toISOString();
			await this.save(data);

			return data;
		} catch (error: unknown) {
			Logger.error(error);
			throw error;
		}
	}

	public async is_excluded(pr_number: number): Promise<boolean> {
		const data = await this.get_excluded_prs();
		return data.excluded.includes(pr_number);
	}

	public async get_excluded_set(): Promise<Set<number>> {
		const data = await this.get_excluded_prs();
		return new Set(data.excluded);
	}

	private async save(data: IExcludedPRs): Promise<void> {
		fs.writeFileSync(this.file_name, JSON.stringify(data));
	}
}
