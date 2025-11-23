<script lang="ts">
	import Link from '$lib/components/Link.svelte';
	import '../styles.css';
	import type { Snippet } from 'svelte';

	let {
		children
	}: {
		children: Snippet;
	} = $props();
</script>

<svelte:head>
	<title>Hydie</title>

	<meta name="description" content="How's Your Developer Involvement and Engagement?" />
</svelte:head>

<header>
	<h1>Hydie</h1>
</header>

<main>
	{@render children()}
</main>

<footer>
	<div>&copy; 2025 Hydie</div>

	<div>
		<Link href="https://github.com/iamthe-Wraith/hydie" kind="light-text">GitHub</Link>
	</div>
</footer>

<style>
	header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		height: 5rem;
		padding: 0 1rem;
		border-bottom: 1px solid var(--neutral-200);

		& h1 {
			margin: 0;
		}
	}

	main {
		min-height: calc(100dvh - 9rem);
	}

	footer {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 0.5rem 1rem;
		height: 4rem;
	}
</style>
