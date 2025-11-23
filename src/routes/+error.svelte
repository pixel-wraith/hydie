<script lang="ts">
	import { page } from '$app/state';
</script>

<div class="error-container">
	<h1>{page.status}</h1>

	<p>{page.error?.message}</p>
</div>

<style>
	.error-container {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding-top: 20vh;
	}

	h1 {
		margin-bottom: 2rem;
		font-size: 4rem;
	}

	p {
		margin-top: 0;
	}
</style>
