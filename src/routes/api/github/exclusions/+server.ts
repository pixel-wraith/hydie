import { ExclusionsService } from '$lib/services/exclusions';
import { ApiError } from '$lib/utils/api-error';
import { ApiResponse } from '$lib/utils/api-response';
import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
	try {
		const exclusions_service = new ExclusionsService();
		const data = await exclusions_service.get_excluded_prs();

		return json(data);
	} catch (err: unknown) {
		const response = new ApiResponse({ errors: ApiError.parse(err) });
		return error(
			response.status_code,
			response.errors?.[0]?.message || 'An unknown error occurred'
		);
	}
};

export const POST: RequestHandler = async ({ request }) => {
	try {
		const { pr_number } = await request.json();

		if (typeof pr_number !== 'number') {
			return error(400, 'pr_number must be a number');
		}

		const exclusions_service = new ExclusionsService();
		const data = await exclusions_service.toggle_exclusion(pr_number);

		return json(data);
	} catch (err: unknown) {
		const response = new ApiResponse({ errors: ApiError.parse(err) });
		return error(
			response.status_code,
			response.errors?.[0]?.message || 'An unknown error occurred'
		);
	}
};
