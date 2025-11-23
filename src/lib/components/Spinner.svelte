<script lang="ts">
	import type { Snippet } from 'svelte';

	type SpinnerSize = 'small' | 'medium' | 'large';
	type SpinnerType = 'primary' | 'secondary' | 'tertiary' | 'neutral';

	let {
		size = 'medium',
		type = 'primary',
		children
	}: {
		size?: SpinnerSize;
		type?: SpinnerType;
		children?: Snippet;
	} = $props();
</script>

<div class="spinner-container {size} {type}">
	<div class="spinner spinner-1 {size}"></div>
	<div class="spinner spinner-2 {size}"></div>

	<div class="content {size}">
		{@render children?.()}
	</div>
</div>

<style>
	.spinner-container {
		--spinner-size: 6rem;
		--spinner-color-dim: var(--primary-200);
		--spinner-color-bright: var(--primary-400);

		position: relative;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 100%;
		height: 100%;
		min-height: var(--spinner-size);

		&.small {
			--spinner-size: 4rem;
		}

		&.medium {
			--spinner-size: 6rem;
		}

		&.large {
			--spinner-size: 8rem;
		}

		&.primary {
			--spinner-color-dim: var(--primary-200);
			--spinner-color-bright: var(--primary-400);
		}

		&.secondary {
			--spinner-color-dim: var(--secondary-200);
			--spinner-color-bright: var(--secondary-400);
		}

		&.tertiary {
			--spinner-color-dim: var(--secondary-200);
			--spinner-color-bright: var(--secondary-400);
		}

		&.neutral {
			--spinner-color-dim: var(--neutral-200);
			--spinner-color-bright: var(--neutral-400);
		}
	}

	.spinner {
		position: absolute;
		top: 50%;
		left: 50%;
		border-radius: 50%;
		transform: translate(-50%, -50%);

		&.small {
			width: var(--spinner-size);
			height: var(--spinner-size);
		}

		&.medium {
			width: var(--spinner-size);
			height: var(--spinner-size);
		}

		&.large {
			width: var(--spinner-size);
			height: var(--spinner-size);
		}
	}

	.spinner {
		background-color: var(--neutral-100);
	}

	.spinner-1 {
		animation: spin 4s linear infinite;
	}

	.spinner-2 {
		animation: spin 6s linear infinite;
	}

	@keyframes spin {
		0% {
			transform: translate(-50%, -50%) rotate(0deg);
			box-shadow: 0.25rem 0 1rem 0 var(--spinner-color-dim);
		}
		50% {
			box-shadow: 0.5rem 0 1.5rem 0 var(--spinner-color-bright);
		}
		100% {
			transform: translate(-50%, -50%) rotate(360deg);
			box-shadow: 0.25rem 0 1rem 0 var(--spinner-color-dim);
		}
	}

	.content {
		position: relative;
		z-index: 1;

		&.small {
			font-size: 0.6rem;
		}

		&.medium {
			font-size: 0.8rem;
		}

		&.large {
			font-size: 1.1rem;
		}
	}
</style>
