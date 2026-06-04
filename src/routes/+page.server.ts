import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { CodeReviewsService } from '$lib/services/code-reviews';
import {
	DeveloperVisibilityService,
	apply_visibility_filter
} from '$lib/services/developer-visibility';
import { calculate_team_stats } from '$lib/services/team-stats';
import { ApiError } from '$lib/utils/api-error';
import { ApiResponse } from '$lib/utils/api-response';

export const load: PageServerLoad = async () => {
	try {
		const code_review_service = new CodeReviewsService();
		const visibility_service = new DeveloperVisibilityService();

		const sync_data = await code_review_service.get_synced_data();
		const hidden = await visibility_service.get_hidden();

		// Filter first, then derive team stats from the visible developers only, so
		// the scorecards match the tables rendered below them.
		const visible_data = apply_visibility_filter(sync_data, hidden);

		return {
			...visible_data,
			team_stats: calculate_team_stats(visible_data)
		};
	} catch (err: unknown) {
		const response = new ApiResponse({ errors: ApiError.parse(err) });
		return error(
			response.status_code,
			response.errors?.[0]?.message ?? 'An unknown error occurred'
		);
	}
};
