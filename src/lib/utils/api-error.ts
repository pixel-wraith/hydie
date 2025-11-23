import type { NumericRange } from '@sveltejs/kit';

export interface IApiError {
	data?: Record<string, unknown>;
	field?: string | null;
	message: string;
	status_code: NumericRange<200, 599>;
}

export class ApiError extends Error {
	field: string | null;
	data: Record<string, unknown>;
	status_code: NumericRange<200, 599>;

	constructor(
		message: string,
		status_code: NumericRange<200, 599>,
		field?: string | null,
		data?: Record<string, unknown>
	) {
		super(message);

		this.field = field || null;
		this.data = data || {};
		this.status_code = status_code < 400 ? 500 : status_code;
	}

	toJSON = () => {
		return {
			status_code: this.status_code,
			message: this.message,
			field: this.field ?? null,
			data: this.data ?? {}
		};
	};

	static parse(error: unknown): ApiError[] {
		if (Array.isArray(error)) {
			let errors: ApiError[] = [];

			error.forEach((e) => {
				const parsed = ApiError.parse(e);
				if (Array.isArray(parsed)) {
					errors = errors.concat(parsed);
				} else {
					errors.push(parsed);
				}
			});

			return errors;
		}

		if (error instanceof ApiError) return [error];

		return [new ApiError((error as Error).message, 500)];
	}
}
