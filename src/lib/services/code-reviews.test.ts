import { describe, it, expect } from 'vitest';
import { is_closed_unmerged } from './code-reviews';

describe('is_closed_unmerged', () => {
	it('returns true for a PR closed without being merged', () => {
		expect(is_closed_unmerged({ state: 'closed', merged_at: null })).toBe(true);
	});

	it('returns false for a merged PR (closed with a merged_at timestamp)', () => {
		expect(is_closed_unmerged({ state: 'closed', merged_at: '2026-05-01T00:00:00Z' })).toBe(false);
	});

	it('returns false for an open PR', () => {
		expect(is_closed_unmerged({ state: 'open', merged_at: null })).toBe(false);
	});

	it('treats an empty-string merged_at as never merged', () => {
		expect(is_closed_unmerged({ state: 'closed', merged_at: '' })).toBe(true);
	});
});
