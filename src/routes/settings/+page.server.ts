import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { CodeReviewsService } from '$lib/services/code-reviews';
import {
	DeveloperVisibilityService,
	list_dashboard_developers
} from '$lib/services/developer-visibility';
import { ApiError } from '$lib/utils/api-error';
import { ApiResponse } from '$lib/utils/api-response';

export const load: PageServerLoad = async () => {
	try {
		const code_review_service = new CodeReviewsService();
		const visibility_service = new DeveloperVisibilityService();

		const sync_data = await code_review_service.get_synced_data();
		const hidden = await visibility_service.get_hidden();

		return {
			developers: list_dashboard_developers(sync_data),
			hidden,
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
