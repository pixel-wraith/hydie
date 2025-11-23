import { describe, test, expect } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/svelte';
import Page from './+page.svelte';

describe('/+page.svelte', () => {
	test('should render not-synced message when status is not-synced', () => {
		render(Page, {
			props: {
				data: {
					status: 'not-synced',
					last_synced: null,
					data: {}
				}
			}
		});
		expect(screen.getByText('Code reviews have not been synced yet.')).toBeInTheDocument();
	});
});
