# Performance Optimizations for Code Review Data Retrieval

This document analyzes the current implementation in `src/lib/services/code-reviews.ts` and identifies optimizations to improve the speed of fetching PR review data from GitHub.

## Current Implementation Analysis

The primary bottleneck is in the `get_all_reviews` method (lines 91-146). The current flow:

1. Fetch **all** pull requests from the repository using pagination
2. Filter PRs client-side to those updated within the date range
3. For each PR, **sequentially** fetch its reviews one-by-one
4. Filter reviews by date and aggregate by user

### Quantified Performance Issue

For a repository with 500 total PRs but only 50 updated in the last 14 days:

- **5 API calls** to paginate through all 500 PRs (100 per page)
- **50 sequential API calls** to fetch reviews for each recent PR
- **Total: ~55+ API calls executed sequentially**

With network latency of ~100-200ms per call, this results in **5-11+ seconds** of wait time just for API calls.

---

## Critical Optimizations (High Impact)

### 1. Parallelize Review Fetching

**Current Code (lines 113-124):**

```typescript
for (const pr of recentPRs) {
    const reviews = await this.octokit.paginate(
        'GET /repos/{owner}/{repo}/pulls/{pull_number}/reviews',
        { ... }
    );
    allReviews.push(...reviews);
}
```

**Problem:** Sequential execution - each PR's reviews are fetched only after the previous one completes.

**Solution:** Use `Promise.all` with batching to respect rate limits:

```typescript
const BATCH_SIZE = 10; // Respect rate limits
const allReviews = [];

for (let i = 0; i < recentPRs.length; i += BATCH_SIZE) {
	const batch = recentPRs.slice(i, i + BATCH_SIZE);
	const batchResults = await Promise.all(
		batch.map((pr) =>
			this.octokit.paginate('GET /repos/{owner}/{repo}/pulls/{pull_number}/reviews', {
				owner: GITHUB_OWNER,
				repo: GITHUB_REPO,
				pull_number: pr.number,
				per_page: 100
			})
		)
	);
	allReviews.push(...batchResults.flat());
}
```

**Expected Improvement:** 5-10x faster for the review fetching phase.

---

### 2. Use GitHub Search API Instead of Listing All PRs

**Current Code (lines 94-109):**

```typescript
const pullRequests = await this.octokit.paginate(
    'GET /repos/{owner}/{repo}/pulls',
    { state: 'all', sort: 'updated', ... }
);
const recentPRs = pullRequests.filter(pr =>
    new Date(pr.updated_at) >= new Date(startDate)
);
```

**Problem:** Fetches ALL PRs (potentially thousands) then filters client-side.

**Solution:** Use the Search API with date filtering:

```typescript
const searchQuery = `repo:${GITHUB_OWNER}/${GITHUB_REPO} type:pr updated:>=${startDate.split('T')[0]}`;
const pullRequests = await this.octokit.paginate('GET /search/issues', {
	q: searchQuery,
	sort: 'updated',
	order: 'desc',
	per_page: 100
});
```

**Expected Improvement:** Reduces PR fetching from potentially 10+ paginated calls to 1-2 calls.

---

### 3. Use GitHub GraphQL API (Best Option)

**Problem:** REST API requires N+1 calls (1 for PRs + N for each PR's reviews).

**Solution:** GraphQL can fetch PRs with their reviews in a single query:

```graphql
query ($owner: String!, $repo: String!, $cursor: String) {
	repository(owner: $owner, name: $repo) {
		pullRequests(first: 100, after: $cursor, orderBy: { field: UPDATED_AT, direction: DESC }) {
			pageInfo {
				hasNextPage
				endCursor
			}
			nodes {
				number
				updatedAt
				reviews(first: 100) {
					nodes {
						author {
							login
						}
						submittedAt
						state
					}
				}
			}
		}
	}
}
```

**Implementation:**

```typescript
import { graphql } from '@octokit/graphql';

const graphqlWithAuth = graphql.defaults({
	headers: { authorization: `token ${GITHUB_TOKEN}` }
});

const { repository } = await graphqlWithAuth(query, { owner, repo });
```

**Expected Improvement:** Reduces 55+ API calls to 1-3 GraphQL queries. **10-50x faster.**

---

## Medium Impact Optimizations

### 4. Early Termination During Pagination

**Current Code:** Fetches all pages of PRs before filtering.

**Solution:** Since PRs are sorted by `updated:desc`, stop pagination once we encounter PRs older than our date range:

```typescript
let allPRs = [];
let page = 1;
let shouldContinue = true;

while (shouldContinue) {
	const { data } = await this.octokit.pulls.list({
		owner: GITHUB_OWNER,
		repo: GITHUB_REPO,
		state: 'all',
		sort: 'updated',
		direction: 'desc',
		per_page: 100,
		page
	});

	if (data.length === 0) break;

	for (const pr of data) {
		if (new Date(pr.updated_at) < new Date(startDate)) {
			shouldContinue = false;
			break;
		}
		allPRs.push(pr);
	}
	page++;
}
```

**Expected Improvement:** Avoids fetching pages of old PRs.

---

### 5. Incremental Sync

**Current Behavior:** Re-fetches all data for the entire 14-day period on every sync.

**Solution:** Track the last sync timestamp and only fetch new/updated data:

```typescript
interface ICodeReviewsData {
	last_synced: string | null;
	last_fetched_until: string | null; // New field
	status: SyncStatus;
	data: Record<string, Record<string, number>>;
}

// On sync, only fetch from last_fetched_until to now
const startDate = file_data.last_fetched_until
	? new Date(file_data.last_fetched_until)
	: this.get_date_range()[0];
```

**Expected Improvement:** Subsequent syncs only fetch minutes/hours of data instead of 14 days.

---

### 6. Remove Redundant Repository Verification

**Current Code (line 152):**

```typescript
await this.verify_repository_access();
```

**Problem:** Makes an extra API call before every sync. Errors would be caught anyway during the actual data fetch.

**Solution:** Remove this call or cache the result:

```typescript
private repoVerified = false;

private async verify_repository_access() {
    if (this.repoVerified) return;
    // ... verification logic
    this.repoVerified = true;
}
```

**Expected Improvement:** Saves 1 API call per sync.

---

### 7. Eliminate Redundant Date Filtering

**Current Code:** Filters dates in two places:

- `get_all_reviews` (lines 127-130)
- `get_code_reviews` (line 167)

**Solution:** Filter once at the source.

---

## Lower Impact Optimizations

### 8. Conditional Requests with ETags

GitHub supports conditional requests. Store the ETag from responses and use `If-None-Match` header:

```typescript
const response = await this.octokit.pulls.list({
	// ... params
	headers: { 'If-None-Match': storedETag }
});

if (response.status === 304) {
	return cachedData; // Data hasn't changed
}
```

---

### 9. Proactive Rate Limit Management

Check rate limits before making bulk requests:

```typescript
const { data: rateLimit } = await this.octokit.rateLimit.get();
const remaining = rateLimit.resources.core.remaining;

if (remaining < requiredCalls) {
	const resetTime = new Date(rateLimit.resources.core.reset * 1000);
	throw new ApiError(`Rate limit low. Resets at ${resetTime.toISOString()}`, 429);
}
```

---

### 10. Request Caching Layer

Add a short-lived cache for API responses to avoid duplicate requests:

```typescript
import NodeCache from 'node-cache';

const cache = new NodeCache({ stdTTL: 300 }); // 5-minute cache

async function cachedRequest(key: string, fetcher: () => Promise<any>) {
	const cached = cache.get(key);
	if (cached) return cached;

	const result = await fetcher();
	cache.set(key, result);
	return result;
}
```

---

## Recommended Implementation Priority

| Priority | Optimization                    | Effort  | Impact                  |
| -------- | ------------------------------- | ------- | ----------------------- |
| 1        | Parallelize review fetching     | Low     | High                    |
| 2        | Use Search API for PRs          | Low     | High                    |
| 3        | Use GraphQL API                 | Medium  | Very High               |
| 4        | Early termination on pagination | Low     | Medium                  |
| 5        | Incremental sync                | Medium  | High (for repeat syncs) |
| 6        | Remove redundant verification   | Trivial | Low                     |
| 7        | Eliminate redundant filtering   | Trivial | Low                     |

## Quick Win Implementation

For immediate improvement with minimal code changes, implement optimizations #1 and #2:

1. Replace the sequential for-loop with batched `Promise.all`
2. Replace the PR list endpoint with the Search API

This combination should provide **5-20x performance improvement** with minimal refactoring effort.

## Long-term Recommendation

Migrate to the **GraphQL API** (optimization #3). While it requires more upfront work, it provides:

- Single query for PRs + reviews
- Precise field selection (less data transfer)
- Native pagination with cursors
- Future flexibility for fetching additional data (comments, reactions, etc.)
