import { DeveloperVisibilityService } from '$lib/services/developer-visibility';
import { ApiError } from '$lib/utils/api-error';
import { ApiResponse } from '$lib/utils/api-response';
import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
	try {
		const visibility_service = new DeveloperVisibilityService();
		const data = await visibility_service.get_hidden();

		return json(data);
	} catch (err: unknown) {
		const response = new ApiResponse({ errors: ApiError.parse(err) });
		return error(
			response.status_code,
			response.errors?.[0]?.message || 'An unknown error occurred'
		);
	}
};

export const PUT: RequestHandler = async ({ request }) => {
	try {
		const body = await request.json();

		const is_string_array = (value: unknown): value is string[] =>
			Array.isArray(value) && value.every((item) => typeof item === 'string');

		for (const section of ['reviews', 'pr_sizes', 'contributor_stats'] as const) {
			if (body[section] !== undefined && !is_string_array(body[section])) {
				return error(400, `${section} must be an array of strings`);
			}
		}

		const visibility_service = new DeveloperVisibilityService();
		const data = await visibility_service.set_hidden({
			reviews: body.reviews,
			pr_sizes: body.pr_sizes,
			contributor_stats: body.contributor_stats
		});

		return json(data);
	} catch (err: unknown) {
		const response = new ApiResponse({ errors: ApiError.parse(err) });
		return error(
			response.status_code,
			response.errors?.[0]?.message || 'An unknown error occurred'
		);
	}
};
