import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { CodeReviewsService } from '$lib/services/code-reviews';
import { ExclusionsService } from '$lib/services/exclusions';
import { ApiError } from '$lib/utils/api-error';
import { ApiResponse } from '$lib/utils/api-response';

export const load: PageServerLoad = async () => {
	try {
		const code_review_service = new CodeReviewsService();
		const exclusions_service = new ExclusionsService();

		const sync_data = await code_review_service.get_synced_data();
		const exclusions = await exclusions_service.get_excluded_prs();

		return {
			pull_requests: sync_data.pull_requests ?? [],
			excluded: exclusions.excluded,
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
