<script lang="ts">
	import { onMount } from 'svelte';
	import type { PageData } from './$types';
	import Button from '$lib/components/Button.svelte';
	import Link from '$lib/components/Link.svelte';
	import Spinner from '$lib/components/Spinner.svelte';
	import dayjs from 'dayjs';
	import type { IPullRequestInfo } from '../../types';

	let { data }: { data: PageData } = $props();

	let excluded = $state(new Set<number>(data.excluded));
	let pr_groups = $state<Record<string, IPullRequestInfo[]>>({});
	let has_changes = $state(false);
	let is_recalculating = $state(false);

	onMount(() => {
		pr_groups = group_by_author(data.pull_requests);
	});

	const group_by_author = (
		pull_requests: IPullRequestInfo[]
	): Record<string, IPullRequestInfo[]> => {
		const groups: Record<string, IPullRequestInfo[]> = {};

		for (const pr of pull_requests) {
			if (!groups[pr.author]) {
				groups[pr.author] = [];
			}
			groups[pr.author].push(pr);
		}

		// Sort PRs within each group by number descending (newest first)
		for (const author of Object.keys(groups)) {
			groups[author].sort((a, b) => b.number - a.number);
		}

		return groups;
	};

	const toggle_exclusion = async (pr_number: number) => {
		// Optimistic update
		if (excluded.has(pr_number)) {
			excluded.delete(pr_number);
		} else {
			excluded.add(pr_number);
		}
		excluded = new Set(excluded); // Trigger reactivity
		has_changes = true;

		// Persist to server
		await fetch('/api/github/exclusions', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({ pr_number })
		});
	};

	const recalculate = async () => {
		is_recalculating = true;
		await fetch('/api/github/exclusions/recalculate', { method: 'POST' });
		has_changes = false;
		is_recalculating = false;
	};

	const get_sorted_authors = (): string[] => {
		return Object.keys(pr_groups).sort((a, b) => {
			// Sort by PR count descending
			return pr_groups[b].length - pr_groups[a].length;
		});
	};
</script>

<div class="contributors-page">
	<header>
		<div class="header-content">
			<h1>Contributors</h1>
			<p class="last-synced">
				Last synced: {data.last_synced
					? dayjs(data.last_synced).format('MMM DD, YYYY hh:mm A')
					: '--'}
			</p>
		</div>

		<div class="actions">
			{#if has_changes}
				<Button onclick={recalculate} kind="primary" processing={is_recalculating}>
					{is_recalculating ? 'Recalculating...' : 'Recalculate Stats'}
				</Button>
			{/if}
			<Link href="/" kind="secondary-text">Back to Dashboard</Link>
		</div>
	</header>

	{#if data.status === 'not-synced'}
		<div class="not-synced-container">
			<p>No PR data available. Please sync from the Dashboard first.</p>
			<Link href="/" kind="primary">Go to Dashboard</Link>
		</div>
	{:else if data.status === 'syncing'}
		<div class="syncing-container">
			<Spinner size="large" type="tertiary">Syncing</Spinner>
			<p class="metadata">Please wait...</p>
		</div>
	{:else if Object.keys(pr_groups).length === 0}
		<div class="empty-container">
			<p>No PRs found in the last 14 days.</p>
		</div>
	{:else}
		<div class="contributors-list">
			{#if has_changes}
				<div class="changes-notice">
					<p>
						You have pending changes. Click "Recalculate Stats" to update the Dashboard statistics.
					</p>
				</div>
			{/if}

			{#each get_sorted_authors() as author (author)}
				<section class="contributor-section">
					<h2>
						{author}
						<span class="pr-count">({pr_groups[author].length} PRs)</span>
					</h2>

					<div class="pr-list">
						{#each pr_groups[author] as pr (pr.number)}
							<div
								class="pr-item"
								class:excluded={excluded.has(pr.number)}
								class:large-pr={pr.additions + pr.deletions > 1000}
							>
								<label class="pr-checkbox">
									<input
										type="checkbox"
										checked={excluded.has(pr.number)}
										onchange={() => toggle_exclusion(pr.number)}
									/>
									<span class="checkbox-label">Exclude</span>
								</label>

								<div class="pr-info">
									<a href={pr.html_url} target="_blank" rel="noopener noreferrer" class="pr-title">
										#{pr.number} - {pr.title}
									</a>
									<div class="pr-meta">
										<span class="pr-size"
											>{(pr.additions + pr.deletions).toLocaleString()} lines</span
										>
										<span class="pr-additions">+{pr.additions.toLocaleString()}</span>
										<span class="pr-deletions">-{pr.deletions.toLocaleString()}</span>
									</div>
								</div>
							</div>
						{/each}
					</div>
				</section>
			{/each}
		</div>
	{/if}
</div>

<style>
	.contributors-page {
		padding: 2rem;
		max-width: 1200px;
		margin: 0 auto;
	}

	header {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		margin-bottom: 2rem;
		flex-wrap: wrap;
		gap: 1rem;
	}

	.header-content {
		& h1 {
			margin: 0 0 0.5rem 0;
			color: var(--primary-500);
		}

		& .last-synced {
			margin: 0;
			font-size: 0.8rem;
			color: var(--neutral-500);
		}
	}

	.actions {
		display: flex;
		align-items: center;
		gap: 1rem;
	}

	.not-synced-container,
	.syncing-container,
	.empty-container {
		display: flex;
		flex-direction: column;
		justify-content: center;
		align-items: center;
		gap: 1rem;
		margin-top: 10vh;
		text-align: center;
	}

	.syncing-container {
		gap: 3rem;
		height: 50vh;
		min-height: 18rem;
	}

	.changes-notice {
		background-color: var(--secondary-100);
		border: 1px solid var(--secondary-300);
		border-radius: 0.5rem;
		padding: 1rem;
		margin-bottom: 1.5rem;

		& p {
			margin: 0;
			color: var(--secondary-700);
			font-size: 0.9rem;
		}
	}

	.contributors-list {
		display: flex;
		flex-direction: column;
		gap: 2rem;
	}

	.contributor-section {
		background-color: var(--neutral-50);
		border: 1px solid var(--neutral-200);
		border-radius: 0.5rem;
		padding: 1.5rem;

		& h2 {
			margin: 0 0 1rem 0;
			font-size: 1.1rem;
			color: var(--neutral-800);
			display: flex;
			align-items: baseline;
			gap: 0.5rem;
		}

		& .pr-count {
			font-size: 0.85rem;
			font-weight: normal;
			color: var(--neutral-500);
		}
	}

	.pr-list {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.pr-item {
		display: flex;
		align-items: flex-start;
		gap: 1rem;
		padding: 0.75rem;
		background-color: var(--neutral-0);
		border: 1px solid var(--neutral-200);
		border-radius: 0.25rem;
		transition: background-color 0.15s ease;

		&.large-pr {
			border-color: var(--danger-500);
			border-width: 2px;
		}

		&.excluded {
			background-color: var(--neutral-100);
			opacity: 0.7;

			& .pr-title {
				text-decoration: line-through;
				color: var(--neutral-500);
			}
		}

		&:hover {
			background-color: var(--neutral-100);
		}
	}

	.pr-checkbox {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		cursor: pointer;
		flex-shrink: 0;

		& input[type='checkbox'] {
			width: 1rem;
			height: 1rem;
			cursor: pointer;
			accent-color: var(--danger-500);
		}

		& .checkbox-label {
			font-size: 0.75rem;
			color: var(--neutral-600);
			white-space: nowrap;
		}
	}

	.pr-info {
		flex: 1;
		min-width: 0;
	}

	.pr-title {
		display: block;
		color: var(--primary-600);
		text-decoration: none;
		font-weight: 500;
		margin-bottom: 0.25rem;
		word-break: break-word;

		&:hover {
			text-decoration: underline;
			color: var(--primary-700);
		}
	}

	.pr-meta {
		display: flex;
		gap: 1rem;
		font-size: 0.75rem;
	}

	.pr-size {
		color: var(--neutral-600);
	}

	.pr-additions {
		color: var(--success-600);
	}

	.pr-deletions {
		color: var(--danger-600);
	}
</style>
