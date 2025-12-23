import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { CodeReviewsService } from '$lib/services/code-reviews';
import { ApiError } from '$lib/utils/api-error';
import { ApiResponse } from '$lib/utils/api-response';

export const load: PageServerLoad = async () => {
	try {
		const code_review_service = new CodeReviewsService();
		const sync_data = await code_review_service.get_synced_data();

		// Get unique reviewers from comments
		const reviewers = [
			...new Set(sync_data.review_comments.map((comment) => comment.author))
		].sort();

		return {
			review_comments: sync_data.review_comments ?? [],
			reviewers,
			status: sync_data.status,
			last_synced: sync_data.last_synced
		};
	} catch (err: unknown) {
		const response = new ApiResponse({ errors: ApiError.parse(err) });
		return error(
			response.status_code,
			response.errors?.[0]?.message ?? 'An unknown error occurred'
		);
	}
};
