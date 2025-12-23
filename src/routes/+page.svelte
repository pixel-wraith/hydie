<script lang="ts">
	import { onMount } from 'svelte';
	import type { PageData } from './$types';
	import Button from '$lib/components/Button.svelte';
	import Spinner from '$lib/components/Spinner.svelte';
	import dayjs from 'dayjs';
	import type { ICodeReviewsData, IPRSizeStats, IPRContributorStats } from '../types';

	type Date = {
		date: string;
		is_weekend: boolean;
	};

	type Review = {
		count: number;
		is_weekend: boolean;
	};

	let { data }: { data: PageData } = $props();

	let sync_status = $state(data.status ?? '');
	let error = $state('');

	let dates: Date[] = $state([]);
	let last_synced: string | null = $state(null);
	let user_data: { user: string; reviews: Review[] }[] = $state([]);
	let pr_size_data: { user: string; stats: IPRSizeStats }[] = $state([]);
	let pr_contributor_stats: IPRContributorStats[] = $state([]);

	onMount(() => {
		parse_data(data);
	});

	const parse_data = (data: ICodeReviewsData) => {
		last_synced = data.last_synced;
		user_data = Object.entries(data.data).map(([user, reviews], index) => {
			if (index === 0) {
				dates = Object.keys(reviews).map((date) => ({
					date: dayjs(date).format('MMM DD'),
					is_weekend: dayjs(date).day() === 0 || dayjs(date).day() === 6
				}));
			}

			return {
				user,
				reviews: Object.entries(reviews).map(([date, count]) => ({
					count,
					is_weekend: dayjs(date).day() === 0 || dayjs(date).day() === 6
				}))
			};
		});

		pr_size_data = Object.entries(data.pr_sizes || {}).map(([user, stats]) => ({
			user,
			stats
		}));

		pr_contributor_stats = data.pr_contributor_stats || [];
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
					<div class="date" class:weekend={date.is_weekend}>
						{date.date}
					</div>
				{/each}
			</div>

			{#each user_data as { user, reviews } (user)}
				<div class="row">
					<div>{user}</div>

					{#each reviews as { count, is_weekend }, index (index)}
						<div class:weekend={is_weekend}>
							{count}
						</div>
					{/each}
				</div>
			{/each}
		</div>

		{#if pr_size_data.length > 0}
			<section class="pr-sizes-section">
				<h2>Average PR Size (Lines Changed)</h2>
				<p class="section-description">
					PR size statistics for all PRs with activity in the last 14 days
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

		{#if pr_contributor_stats.length > 0}
			<section class="pr-contributor-section">
				<h2>PR Contributor Statistics</h2>
				<p class="section-description">
					Statistics for PRs opened (created) within the last 14 days, including time to merge and
					review comments received
				</p>

				<div class="pr-contributor-summary-table">
					<div class="pr-contributor-summary-header pr-contributor-summary-row">
						<div>Contributor</div>
						<div>Total PRs</div>
						<div>Avg Days to Merge</div>
						<div>Avg Review Comments</div>
					</div>

					{#each pr_contributor_stats as stats (stats.author)}
						<div class="pr-contributor-summary-row">
							<div>{stats.author}</div>
							<div>{stats.total_prs}</div>
							<div>{stats.avg_days_to_merge !== null ? stats.avg_days_to_merge : '-'}</div>
							<div>{stats.avg_review_comments}</div>
						</div>
					{/each}
				</div>

				<h3>PRs Opened Per Day</h3>
				<div class="pr-per-day-table">
					<div class="pr-per-day-header pr-per-day-row">
						<div>Contributor</div>
						{#each dates as date (date)}
							<div class="date" class:weekend={date.is_weekend}>{date.date}</div>
						{/each}
					</div>

					{#each pr_contributor_stats as stats (stats.author)}
						<div class="pr-per-day-row">
							<div>{stats.author}</div>
							{#each Object.entries(stats.prs_by_date) as [date, count], index (index)}
								<div class:weekend={dayjs(date).day() === 0 || dayjs(date).day() === 6}>
									{count}
								</div>
							{/each}
						</div>
					{/each}
				</div>

				<h3>Individual PR Details</h3>
				{#each pr_contributor_stats as stats (stats.author)}
					{#if stats.prs.length > 0}
						<details class="pr-details-accordion">
							<summary>{stats.author} ({stats.prs.length} PRs)</summary>
							<div class="pr-details-table">
								<div class="pr-details-header pr-details-row">
									<div>PR</div>
									<div>Title</div>
									<div>Status</div>
									<div>Days</div>
									<div>Comments</div>
								</div>

								{#each stats.prs as pr (pr.number)}
									<div class="pr-details-row">
										<div>
											<a href={pr.html_url} target="_blank" rel="noopener noreferrer">
												#{pr.number}
											</a>
										</div>
										<div class="pr-title" title={pr.title}>{pr.title}</div>
										<div class:open={pr.state === 'open'} class:merged={pr.merged_at}>
											{#if pr.merged_at}
												merged
											{:else if pr.state === 'open'}
												open
											{:else}
												closed
											{/if}
										</div>
										<div>{pr.days_to_merge !== null ? pr.days_to_merge : '-'}</div>
										<div>{pr.review_comments_count}</div>
									</div>
								{/each}
							</div>
						</details>
					{/if}
				{/each}
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

		& .weekend {
			color: var(--neutral-500);
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

	.pr-contributor-section {
		margin-top: 3rem;
		padding: 0 2rem;

		& h2 {
			font-size: 1.25rem;
			color: var(--primary-500);
			margin-bottom: 0.5rem;
		}

		& h3 {
			font-size: 1rem;
			color: var(--secondary-500);
			margin-top: 2rem;
			margin-bottom: 1rem;
		}

		& .section-description {
			font-size: 0.8rem;
			color: var(--neutral-500);
			margin-bottom: 1.5rem;
		}
	}

	.pr-contributor-summary-table {
		display: flex;
		flex-direction: column;
		width: 100%;
		max-width: 50rem;
	}

	.pr-contributor-summary-header {
		& div {
			color: var(--secondary-500);
		}
	}

	.pr-contributor-summary-row {
		display: grid;
		grid-template-columns: 12rem repeat(3, 1fr);
		grid-column-gap: 0.5rem;
		border-bottom: 1px solid var(--neutral-200);
		padding-bottom: 0.5rem;
		margin-bottom: 0.5rem;

		& > div:not(:first-child) {
			text-align: right;
		}
	}

	.pr-per-day-table {
		display: flex;
		flex-direction: column;
		width: 100%;
	}

	.pr-per-day-header {
		align-items: end;

		& div {
			color: var(--secondary-500);
		}
	}

	.pr-per-day-row {
		display: grid;
		grid-template-columns: 12rem repeat(14, 1fr);
		grid-column-gap: 0.5rem;
		border-bottom: 1px solid var(--neutral-200);
		padding-bottom: 0.5rem;
		margin-bottom: 0.5rem;

		& .date {
			font-size: 0.7rem;
		}

		& .weekend {
			color: var(--neutral-500);
		}

		& > div:not(:first-child) {
			text-align: center;
		}
	}

	.pr-details-accordion {
		margin-bottom: 1rem;
		border: 1px solid var(--neutral-200);
		border-radius: 0.5rem;
		overflow: hidden;

		& summary {
			padding: 0.75rem 1rem;
			cursor: pointer;
			background-color: var(--neutral-100);
			font-weight: 500;

			&:hover {
				background-color: var(--neutral-200);
			}
		}
	}

	.pr-details-table {
		display: flex;
		flex-direction: column;
		padding: 1rem;
	}

	.pr-details-header {
		& div {
			color: var(--secondary-500);
			font-weight: 500;
		}
	}

	.pr-details-row {
		display: grid;
		grid-template-columns: 5rem 1fr 5rem 4rem 5rem;
		grid-column-gap: 1rem;
		border-bottom: 1px solid var(--neutral-200);
		padding: 0.5rem 0;
		align-items: center;

		& a {
			color: var(--primary-500);
			text-decoration: none;

			&:hover {
				text-decoration: underline;
			}
		}

		& .pr-title {
			white-space: nowrap;
			overflow: hidden;
			text-overflow: ellipsis;
		}

		& .open {
			color: var(--success-500, #22c55e);
		}

		& .merged {
			color: var(--primary-500);
		}

		& > div:nth-child(n + 3) {
			text-align: center;
		}
	}
</style>
