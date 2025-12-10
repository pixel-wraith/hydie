<script lang="ts">
	import { onMount } from 'svelte';
	import type { PageData } from './$types';
	import Button from '$lib/components/Button.svelte';
	import Spinner from '$lib/components/Spinner.svelte';
	import dayjs from 'dayjs';
	import type { ICodeReviewsData, IPRSizeStats } from '../types';

	let { data }: { data: PageData } = $props();

	let sync_status = $state(data.status ?? '');
	let error = $state('');

	let dates: string[] = $state([]);
	let last_synced: string | null = $state(null);
	let user_data: { user: string; reviews: number[] }[] = $state([]);
	let pr_size_data: { user: string; stats: IPRSizeStats }[] = $state([]);

	onMount(() => {
		parse_data(data);
	});

	const parse_data = (data: ICodeReviewsData) => {
		last_synced = data.last_synced;
		user_data = Object.entries(data.data).map(([user, reviews], index) => {
			if (index === 0) {
				dates = Object.keys(reviews).map((date) => dayjs(date).format('MMM DD'));
			}

			return {
				user,
				reviews: Object.values(reviews)
			};
		});

		pr_size_data = Object.entries(data.pr_sizes || {}).map(([user, stats]) => ({
			user,
			stats
		}));
	};

	const refresh_code_reviews = async () => {
		window.location.reload();
	};

	const sync_code_reviews = async () => {
		try {
			sync_status = 'syncing';
			error = '';
			const response = await fetch('/api/github/code-reviews/sync', {
				method: 'POST'
			});

			if (response.ok) {
				const data = await response.json();
				parse_data(data);
				sync_status = data.status;
			} else {
				const error = await response.json();
				throw new Error(error.message);
			}
		} catch (err: unknown) {
			if (err instanceof Error) {
				error = err.message;
			} else {
				error = 'An unknown error occurred';
			}
		}
	};
</script>

{#if error}
	<div class="error-container flex-center">
		<p class="error">{error}</p>
		<Button onclick={sync_code_reviews}>Retry Sync</Button>
	</div>
{:else if sync_status === 'error'}
	<div class="error-container flex-center">
		<p class="error">An error occurred during the last sync.</p>
		<Button onclick={sync_code_reviews}>Retry Sync</Button>
	</div>
{:else if sync_status === 'syncing'}
	<div class="syncing-container">
		<div>
			<Spinner size="large" type="tertiary">Syncing</Spinner>
		</div>

		<p class="metadata">This may take a few minutes...</p>

		<Button onclick={refresh_code_reviews} kind="tertiary-text">Refresh</Button>
	</div>
{:else if sync_status === 'not-synced'}
	<div class="not-synced-container">
		<p>Code reviews have not been synced yet.</p>

		<Button onclick={sync_code_reviews}>Sync Code Reviews</Button>
	</div>
{:else}
	<div class="synced-container">
		<header>
			<div class="sync-container">
				<p>Last synced: {last_synced ? dayjs(last_synced).format('MMM DD, YYYY hh:mm A') : '--'}</p>

				<Button onclick={sync_code_reviews}>Sync Code Reviews</Button>
			</div>
		</header>

		<div class="table">
			<div class="header row">
				<div>User</div>
				{#each dates as date (date)}
					<div class="date">{date}</div>
				{/each}
			</div>

			{#each user_data as { user, reviews } (user)}
				<div class="row">
					<div>{user}</div>

					{#each reviews as review, index (index)}
						<div>{review}</div>
					{/each}
				</div>
			{/each}
		</div>

		{#if pr_size_data.length > 0}
			<section class="pr-sizes-section">
				<h2>Average PR Size (Lines Changed)</h2>
				<p class="section-description">
					PR size statistics for each contributor over the last 14 days
				</p>

				<div class="pr-sizes-table">
					<div class="pr-sizes-header pr-sizes-row">
						<div>User</div>
						<div>PRs</div>
						<div>Min</div>
						<div>Avg</div>
						<div>Max</div>
					</div>

					{#each pr_size_data as { user, stats } (user)}
						<div class="pr-sizes-row">
							<div>{user}</div>
							<div>{stats.pr_count}</div>
							<div>{stats.min.toLocaleString()}</div>
							<div>{stats.avg.toLocaleString()}</div>
							<div>{stats.max.toLocaleString()}</div>
						</div>
					{/each}
				</div>
			</section>
		{/if}
	</div>
{/if}

<style>
	.error-container {
		display: flex;
		flex-direction: column;
		justify-content: center;
		align-items: center;
		gap: 1rem;
		margin-top: 10vh;
	}

	.syncing-container {
		display: flex;
		flex-direction: column;
		justify-content: center;
		align-items: center;
		gap: 3rem;
		height: 50vh;
		min-height: 18rem;
	}

	.not-synced-container {
		display: flex;
		flex-direction: column;
		justify-content: center;
		align-items: center;
		gap: 1rem;
		margin-top: 10vh;
	}

	.synced-container {
		padding-top: 3rem;

		& header {
			display: flex;
			justify-content: flex-end;
			align-items: center;
			padding: 0 2rem;
		}

		.sync-container {
			display: flex;
			align-items: flex-end;
			gap: 2rem;

			& p {
				margin: 0;
				font-size: 0.8rem;
				color: var(--neutral-500);
			}
		}
	}

	.table {
		display: flex;
		flex-direction: column;
		width: 100%;
		margin-top: 1.5rem;
		padding: 0 2rem;
	}

	.header {
		align-items: end;

		& div {
			color: var(--secondary-500);
		}
	}

	.row {
		display: grid;
		grid-template-columns: 12rem repeat(14, 1fr);
		grid-column-gap: 0.5rem;
		border-bottom: 1px solid var(--neutral-200);
		padding-bottom: 0.5rem;
		margin-bottom: 0.5rem;

		& .date {
			font-size: 0.7rem;
		}

		&:first-child {
			text-align: left;
		}

		& > div:not(:first-child) {
			text-align: center;
		}
	}

	.pr-sizes-section {
		margin-top: 3rem;
		padding: 0 2rem;

		& h2 {
			font-size: 1.25rem;
			color: var(--primary-500);
			margin-bottom: 0.5rem;
		}

		& .section-description {
			font-size: 0.8rem;
			color: var(--neutral-500);
			margin-bottom: 1.5rem;
		}
	}

	.pr-sizes-table {
		display: flex;
		flex-direction: column;
		width: 100%;
		max-width: 40rem;
	}

	.pr-sizes-header {
		& div {
			color: var(--secondary-500);
		}
	}

	.pr-sizes-row {
		display: grid;
		grid-template-columns: 12rem repeat(4, 1fr);
		grid-column-gap: 0.5rem;
		border-bottom: 1px solid var(--neutral-200);
		padding-bottom: 0.5rem;
		margin-bottom: 0.5rem;

		& > div:not(:first-child) {
			text-align: right;
		}
	}
</style>
