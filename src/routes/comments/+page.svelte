<script lang="ts">
	import { onMount } from 'svelte';
	import type { PageData } from './$types';
	import Link from '$lib/components/Link.svelte';
	import Spinner from '$lib/components/Spinner.svelte';
	import dayjs from 'dayjs';
	import relativeTime from 'dayjs/plugin/relativeTime';
	import type { IReviewComment } from '../../types';

	dayjs.extend(relativeTime);

	let { data }: { data: PageData } = $props();

	let selected_reviewer = $state('');
	let filtered_comments: IReviewComment[] = $state([]);

	onMount(() => {
		if (data.reviewers.length > 0) {
			selected_reviewer = data.reviewers[0];
		}
		filter_comments();
	});

	const filter_comments = () => {
		if (!selected_reviewer) {
			filtered_comments = [];
			return;
		}

		filtered_comments = data.review_comments
			.filter((comment) => comment.author === selected_reviewer)
			.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
	};

	const handle_reviewer_change = (event: Event) => {
		const target = event.target as HTMLSelectElement;
		selected_reviewer = target.value;
		filter_comments();
	};

	const format_path = (path: string): string => {
		const parts = path.split('/');
		if (parts.length <= 3) return path;
		return '.../' + parts.slice(-3).join('/');
	};
</script>

<div class="comments-page">
	<header>
		<div class="header-content">
			<h1>Review Comments</h1>
			<p class="last-synced">
				Last synced: {data.last_synced
					? dayjs(data.last_synced).format('MMM DD, YYYY hh:mm A')
					: '--'}
			</p>
		</div>

		<div class="actions">
			<Link href="/" kind="secondary-text">Back to Dashboard</Link>
		</div>
	</header>

	{#if data.status === 'not-synced'}
		<div class="not-synced-container">
			<p>No data available. Please sync from the Dashboard first.</p>
			<Link href="/" kind="primary">Go to Dashboard</Link>
		</div>
	{:else if data.status === 'syncing'}
		<div class="syncing-container">
			<Spinner size="large" type="tertiary">Syncing</Spinner>
			<p class="metadata">Please wait...</p>
		</div>
	{:else if data.reviewers.length === 0}
		<div class="empty-container">
			<p>No review comments found in the last 14 days.</p>
			<Link href="/" kind="secondary-text">Back to Dashboard</Link>
		</div>
	{:else}
		<div class="reviewer-selector">
			<label for="reviewer-select">Select Reviewer:</label>
			<select id="reviewer-select" value={selected_reviewer} onchange={handle_reviewer_change}>
				{#each data.reviewers as reviewer (reviewer)}
					<option value={reviewer}>{reviewer}</option>
				{/each}
			</select>
			<span class="comment-count">
				{filtered_comments.length} comment{filtered_comments.length !== 1 ? 's' : ''}
			</span>
		</div>

		<div class="comments-feed">
			{#if filtered_comments.length === 0}
				<div class="no-comments">
					<p>No comments from this reviewer.</p>
				</div>
			{:else}
				{#each filtered_comments as comment (comment.id)}
					<article class="comment-card">
						<div class="comment-header">
							<span class="comment-author">{comment.author}</span>
							<span
								class="comment-time"
								title={dayjs(comment.created_at).format('MMM DD, YYYY hh:mm A')}
							>
								{dayjs(comment.created_at).fromNow()}
							</span>
						</div>

						<div class="comment-context">
							<a href={comment.pr_url} target="_blank" rel="noopener noreferrer" class="pr-link">
								#{comment.pr_number} - {comment.pr_title}
							</a>
							<div class="file-context">
								<span class="file-path" title={comment.path}>{format_path(comment.path)}</span>
								{#if comment.line}
									<span class="line-number">Line {comment.line}</span>
								{/if}
							</div>
						</div>

						<div class="comment-body">
							{comment.body}
						</div>

						<div class="comment-footer">
							<a
								href={comment.html_url}
								target="_blank"
								rel="noopener noreferrer"
								class="view-link"
							>
								View on GitHub
							</a>
						</div>
					</article>
				{/each}
			{/if}
		</div>
	{/if}
</div>

<style>
	.comments-page {
		padding: 2rem;
		max-width: 800px;
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

	.reviewer-selector {
		display: flex;
		align-items: center;
		gap: 1rem;
		margin-bottom: 2rem;
		padding: 1rem;
		background-color: var(--neutral-100);
		border-radius: 0.5rem;

		& label {
			font-weight: 500;
			color: var(--neutral-700);
		}

		& select {
			padding: 0.5rem 1rem;
			border: 1px solid var(--neutral-300);
			border-radius: 0.25rem;
			font-size: 1rem;
			background-color: var(--neutral-0);
			cursor: pointer;
			min-width: 200px;

			&:focus {
				outline: 2px solid var(--primary-500);
				outline-offset: 2px;
			}
		}

		& .comment-count {
			font-size: 0.85rem;
			color: var(--neutral-500);
			margin-left: auto;
		}
	}

	.comments-feed {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.no-comments {
		text-align: center;
		padding: 3rem;
		background-color: var(--neutral-50);
		border-radius: 0.5rem;
		color: var(--neutral-500);
	}

	.comment-card {
		background-color: var(--neutral-0);
		border: 1px solid var(--neutral-200);
		border-radius: 0.5rem;
		padding: 1rem;
		transition: border-color 0.15s ease;

		&:hover {
			border-color: var(--neutral-300);
		}
	}

	.comment-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 0.75rem;
	}

	.comment-author {
		font-weight: 600;
		color: var(--neutral-800);
	}

	.comment-time {
		font-size: 0.8rem;
		color: var(--neutral-500);
		cursor: help;
	}

	.comment-context {
		margin-bottom: 0.75rem;
		padding-bottom: 0.75rem;
		border-bottom: 1px solid var(--neutral-100);
	}

	.pr-link {
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

	.file-context {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		font-size: 0.8rem;
	}

	.file-path {
		color: var(--neutral-600);
		font-family: monospace;
		background-color: var(--neutral-100);
		padding: 0.125rem 0.375rem;
		border-radius: 0.25rem;
	}

	.line-number {
		color: var(--secondary-600);
		font-family: monospace;
	}

	.comment-body {
		white-space: pre-wrap;
		word-break: break-word;
		line-height: 1.5;
		color: var(--neutral-800);
		font-size: 0.95rem;
	}

	.comment-footer {
		margin-top: 0.75rem;
		padding-top: 0.75rem;
		border-top: 1px solid var(--neutral-100);
	}

	.view-link {
		font-size: 0.8rem;
		color: var(--neutral-500);
		text-decoration: none;

		&:hover {
			color: var(--primary-500);
			text-decoration: underline;
		}
	}
</style>
