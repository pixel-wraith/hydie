/**
 * Remove duplicate pull requests by PR number, keeping the first occurrence.
 *
 * GitHub's `pulls.list` is paginated and sorted by `updated` descending. A PR
 * that is updated while we page through the results can shift between pages and
 * be returned twice. Left unchecked these duplicates inflate every downstream
 * metric (sizes, contributor and reviewer stats all count the PR twice) and
 * crash the contributors page, whose keyed `{#each}` rejects a repeated key.
 * The first occurrence is the freshest (results are newest-updated first).
 *
 * Pure and dependency-free so it is safe to import from both server services
 * and client components.
 */
export function dedupe_prs_by_number<T extends { number: number }>(prs: T[]): T[] {
	const seen = new Set<number>();
	const unique: T[] = [];
	for (const pr of prs) {
		if (seen.has(pr.number)) continue;
		seen.add(pr.number);
		unique.push(pr);
	}
	return unique;
}
