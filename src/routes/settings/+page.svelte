<script lang="ts">
	import type { PageData } from './$types';
	import Button from '$lib/components/Button.svelte';
	import Link from '$lib/components/Link.svelte';
	import dayjs from 'dayjs';

	type ColumnKey = 'reviews' | 'pr_sizes' | 'contributor_stats';

	type Developer = {
		login: string;
		in_reviews: boolean;
		in_pr_sizes: boolean;
		in_contributor_stats: boolean;
	};

	let { data }: { data: PageData } = $props();

	const columns: { key: ColumnKey; label: string; applies: (dev: Developer) => boolean }[] = [
		{ key: 'reviews', label: 'Reviews', applies: (dev) => dev.in_reviews },
		{ key: 'pr_sizes', label: 'PR Sizes', applies: (dev) => dev.in_pr_sizes },
		{
			key: 'contributor_stats',
			label: 'Contributor Stats',
			applies: (dev) => dev.in_contributor_stats
		}
	];

	let developers = $state<Developer[]>(data.developers ?? []);
	let hidden = $state<Record<ColumnKey, Set<string>>>({
		reviews: new Set(data.hidden.reviews),
		pr_sizes: new Set(data.hidden.pr_sizes),
		contributor_stats: new Set(data.hidden.contributor_stats)
	});

	let save_error = $state('');

	const is_shown = (column: ColumnKey, login: string): boolean => !hidden[column].has(login);

	const persist = async () => {
		try {
			save_error = '';
			const response = await fetch('/api/github/developer-visibility', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					reviews: [...hidden.reviews],
					pr_sizes: [...hidden.pr_sizes],
					contributor_stats: [...hidden.contributor_stats]
				})
			});

			if (!response.ok) {
				const error = await response.json();
				throw new Error(error.message ?? 'Failed to save changes');
			}
		} catch (err: unknown) {
			save_error = err instanceof Error ? err.message : 'Failed to save changes';
		}
	};

	const toggle = (column: ColumnKey, login: string) => {
		if (hidden[column].has(login)) {
			hidden[column].delete(login);
		} else {
			hidden[column].add(login);
		}
		hidden = { ...hidden, [column]: new Set(hidden[column]) };
		persist();
	};

	const show_all = (column: ColumnKey) => {
		hidden = { ...hidden, [column]: new Set() };
		persist();
	};

	const hide_all = (column: ColumnKey) => {
		const next = new Set(hidden[column]);
		for (const dev of developers) {
			if (columns.find((col) => col.key === column)!.applies(dev)) {
				next.add(dev.login);
			}
		}
		hidden = { ...hidden, [column]: next };
		persist();
	};
</script>

<div class="settings-page">
	<header>
		<div class="header-content">
			<h1>Settings</h1>
			<p class="last-synced">
				Last synced: {data.last_synced
					? dayjs(data.last_synced).format('MMM DD, YYYY hh:mm A')
					: '--'}
			</p>
		</div>

		<Link href="/" kind="secondary-text">Back to Dashboard</Link>
	</header>

	<section class="intro">
		<h2>Developer Visibility</h2>
		<p class="section-description">
			Choose which developers appear in each section of the dashboard. Checked means shown. Changes
			save automatically and apply the next time the dashboard loads. This only affects the
			dashboard &mdash; the Contributors and Comments pages still show everyone.
		</p>
		{#if save_error}
			<p class="save-error">{save_error}</p>
		{/if}
	</section>

	{#if data.status === 'not-synced'}
		<div class="empty-container">
			<p>No developer data available. Please sync from the Dashboard first.</p>
			<Link href="/" kind="primary">Go to Dashboard</Link>
		</div>
	{:else if developers.length === 0}
		<div class="empty-container">
			<p>No developers found in the last 14 days.</p>
		</div>
	{:else}
		<div class="visibility-table">
			<div class="visibility-header visibility-row">
				<div class="dev-name">Developer</div>
				{#each columns as column (column.key)}
					<div class="column-head">
						<span class="column-label">{column.label}</span>
						<span class="column-actions">
							<Button kind="neutral-text" onclick={() => show_all(column.key)}>Show all</Button>
							<span class="divider">|</span>
							<Button kind="neutral-text" onclick={() => hide_all(column.key)}>Hide all</Button>
						</span>
					</div>
				{/each}
			</div>

			{#each developers as dev (dev.login)}
				<div class="visibility-row">
					<div class="dev-name">{dev.login}</div>
					{#each columns as column (column.key)}
						<div class="cell">
							{#if column.applies(dev)}
								<label class="visibility-checkbox">
									<input
										type="checkbox"
										checked={is_shown(column.key, dev.login)}
										onchange={() => toggle(column.key, dev.login)}
									/>
									<span class="checkbox-label">Show</span>
								</label>
							{:else}
								<span class="not-applicable" title="No {column.label.toLowerCase()} data"
									>&mdash;</span
								>
							{/if}
						</div>
					{/each}
				</div>
			{/each}
		</div>
	{/if}
</div>

<style>
	.settings-page {
		padding: 2rem;
		max-width: 1000px;
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

	.intro {
		margin-bottom: 1.5rem;

		& h2 {
			font-size: 1.25rem;
			color: var(--secondary-500);
			margin: 0 0 0.5rem 0;
		}

		& .section-description {
			font-size: 0.85rem;
			color: var(--neutral-500);
			margin: 0;
			max-width: 60rem;
		}

		& .save-error {
			margin: 0.75rem 0 0 0;
			font-size: 0.85rem;
			color: var(--danger-500);
		}
	}

	.empty-container {
		display: flex;
		flex-direction: column;
		justify-content: center;
		align-items: center;
		gap: 1rem;
		margin-top: 10vh;
		text-align: center;
	}

	.visibility-table {
		display: flex;
		flex-direction: column;
		width: 100%;
	}

	.visibility-row {
		display: grid;
		grid-template-columns: 16rem repeat(3, 1fr);
		grid-column-gap: 0.5rem;
		align-items: center;
		border-bottom: 1px solid var(--neutral-200);
		padding: 0.5rem 0;
	}

	.visibility-header {
		align-items: end;

		& .dev-name {
			color: var(--secondary-500);
		}
	}

	.column-head {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.25rem;
		text-align: center;

		& .column-label {
			color: var(--secondary-500);
			font-weight: 500;
		}

		& .column-actions {
			display: flex;
			align-items: center;
			gap: 0.5rem;
			font-size: 0.75rem;
		}

		& .divider {
			color: var(--neutral-300);
		}
	}

	.dev-name {
		font-weight: 500;
		color: var(--neutral-800);
		word-break: break-word;
	}

	.cell {
		display: flex;
		justify-content: center;
	}

	.visibility-checkbox {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		cursor: pointer;

		& input[type='checkbox'] {
			width: 1rem;
			height: 1rem;
			cursor: pointer;
			accent-color: var(--primary-500);
		}

		& .checkbox-label {
			font-size: 0.75rem;
			color: var(--neutral-600);
		}
	}

	.not-applicable {
		color: var(--neutral-300);
		font-size: 0.85rem;
	}
</style>
