import { CodeReviewsService } from '$lib/services/code-reviews';
import { ApiError } from '$lib/utils/api-error';
import { ApiResponse } from '$lib/utils/api-response';
import { error, json } from '@sveltejs/kit';

export const POST = async () => {
	try {
		const code_review_service = new CodeReviewsService();
		const data = await code_review_service.sync();

		return json(data);
	} catch (err: unknown) {
		const response = new ApiResponse({ errors: ApiError.parse(err) });
		return error(
			response.status_code,
			response.errors?.[0]?.message || 'An unknown error occurred'
		);
	}
};
