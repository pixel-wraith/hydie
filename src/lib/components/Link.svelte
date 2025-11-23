<script lang="ts">
	import type { HTMLAnchorAttributes } from 'svelte/elements';
	export interface IButtonProps extends HTMLAnchorAttributes {
		kind?:
			| 'primary'
			| 'secondary'
			| 'tertiary'
			| 'neutral'
			| 'light'
			| 'danger'
			| 'success'
			| 'transparent'
			| 'primary-text'
			| 'secondary-text'
			| 'tertiary-text'
			| 'neutral-text'
			| 'light-text'
			| 'danger-text'
			| 'success-text'
			| 'transparent-text';
	}

	let { children, kind = 'primary', ...rest }: IButtonProps = $props();
</script>

<a {...rest} class={kind}>
	<span class="text">
		{@render children?.()}
	</span>
</a>

<style>
	a {
		position: relative;
		padding: 0.5rem 1rem;
		color: var(--neutral-900);
		border: none;
		border-radius: 4px;
		text-decoration: none;

		&:hover {
			cursor: pointer;
		}
	}

	.primary {
		background-color: var(--primary-400);

		&:hover {
			background-color: var(--primary-500);
		}
	}

	.primary-text {
		padding: 0;
		background-color: transparent;
		border: none;

		&:hover .text {
			color: var(--primary-600);
		}

		.text {
			color: var(--primary-500);
		}
	}

	.secondary {
		background-color: var(--secondary-400);

		&:hover {
			background-color: var(--secondary-500);
		}
	}

	.secondary-text {
		padding: 0;
		background-color: transparent;
		border: none;

		&:hover .text {
			color: var(--secondary-600);
		}

		.text {
			color: var(--secondary-500);
		}
	}

	.tertiary {
		background-color: var(--secondary-400);

		&:hover {
			background-color: var(--secondary-500);
		}
	}

	.tertiary-text {
		padding: 0;
		background-color: transparent;
		border: none;

		&:hover .text {
			color: var(--secondary-600);
		}

		.text {
			color: var(--secondary-500);
		}
	}

	.neutral {
		background-color: var(--neutral-400);

		&:hover {
			background-color: var(--neutral-500);
		}
	}

	.neutral-text {
		padding: 0;
		background-color: transparent;
		border: none;

		&:hover .text {
			color: var(--neutral-600);
		}

		.text {
			color: var(--neutral-500);
		}
	}

	.light {
		background-color: var(--neutral-900);

		&:hover {
			background-color: var(--neutral-700);
		}

		.text {
			color: var(--neutral-100);
		}
	}

	.light-text {
		padding: 0;
		background-color: transparent;
		border: none;

		&:hover .text {
			color: var(--neutral-700);
		}

		.text {
			color: var(--neutral-900);
		}
	}

	.danger {
		background-color: var(--danger-400);

		&:hover {
			background-color: var(--danger-500);
		}
	}

	.danger-text {
		padding: 0;
		background-color: transparent;
		border: none;

		&:hover {
			color: var(--danger-600);
		}

		.text {
			color: var(--danger-500);
		}
	}

	.success {
		background-color: var(--success-400);

		&:hover {
			background-color: var(--success-500);
		}
	}

	.success-text {
		padding: 0;
		background-color: transparent;
		border: none;

		&:hover {
			color: var(--success-600);
		}

		.text {
			color: var(--success-500);
		}
	}

	.transparent {
		padding: 0.5rem;
		background-color: transparent;

		&:hover {
			color: var(--neutral-800);
		}
	}
</style>
