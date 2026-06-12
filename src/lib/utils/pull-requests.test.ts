import { describe, it, expect } from 'vitest';
import { dedupe_prs_by_number } from './pull-requests';

describe('dedupe_prs_by_number', () => {
	it('returns the list unchanged when there are no duplicates', () => {
		const prs = [{ number: 1 }, { number: 2 }, { number: 3 }];
		expect(dedupe_prs_by_number(prs)).toEqual([{ number: 1 }, { number: 2 }, { number: 3 }]);
	});

	it('removes duplicate PR numbers, keeping the first occurrence', () => {
		const first = { number: 1376, title: 'fresh' };
		const stale = { number: 1376, title: 'stale' };
		const result = dedupe_prs_by_number([first, { number: 1377 }, stale]);
		expect(result).toEqual([first, { number: 1377 }]);
		// The first occurrence (freshest, since results are newest-updated first) wins.
		expect(result[0]).toBe(first);
	});

	it('collapses several duplicates of the same number to one entry', () => {
		const result = dedupe_prs_by_number([{ number: 5 }, { number: 5 }, { number: 5 }]);
		expect(result).toEqual([{ number: 5 }]);
	});

	it('preserves the original ordering of distinct PRs', () => {
		const prs = [{ number: 3 }, { number: 1 }, { number: 3 }, { number: 2 }];
		expect(dedupe_prs_by_number(prs).map((p) => p.number)).toEqual([3, 1, 2]);
	});

	it('returns an empty array for empty input', () => {
		expect(dedupe_prs_by_number([])).toEqual([]);
	});
});
