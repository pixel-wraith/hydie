import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { CodeReviewsService } from '$lib/services/code-reviews';
import { ExclusionsService } from '$lib/services/exclusions';
import { get_date_range, prs_created_in_window } from '$lib/services/metrics';
import { ApiError } from '$lib/utils/api-error';
import { ApiResponse } from '$lib/utils/api-response';

export const load: PageServerLoad = async () => {
	try {
		const code_review_service = new CodeReviewsService();
		const exclusions_service = new ExclusionsService();

		const sync_data = await code_review_service.get_synced_data();
		const exclusions = await exclusions_service.get_excluded_prs();

		// Scope to PRs created in the window (and authored by humans), matching the
		// dashboard's "PRs created in the window" definition. The stored list holds
		// every PR *updated* in the window, which drags in ancient PRs that merely
		// received recent activity — inflating per-author counts on this page.
		const pull_requests = prs_created_in_window(sync_data.pull_requests ?? [], get_date_range());

		return {
			pull_requests,
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
