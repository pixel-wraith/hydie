<script lang="ts">
	import type { HTMLButtonAttributes } from 'svelte/elements';

	export interface IButtonProps extends HTMLButtonAttributes {
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
		processing?: boolean;
	}

	let {
		children,
		type = 'button',
		kind = 'primary',
		disabled = false,
		processing = false,
		...rest
	}: IButtonProps = $props();
</script>

<button {...rest} {type} class={kind} class:processing disabled={disabled || processing}>
	<span class="text">
		{@render children?.()}
	</span>

	{#if processing}
		<span class="spinner">
			<i class="fa-sharp-duotone fa-solid fa-fan fa-spin"></i>
		</span>
	{/if}
</button>

<style>
	button {
		position: relative;
		padding: 0.5rem 1rem;
		color: var(--neutral-100);
		border: none;
		border-radius: 4px;

		&:hover:not(:disabled) {
			cursor: pointer;
		}

		&:disabled {
			cursor: not-allowed;
		}

		&:disabled:not(.processing) {
			.text {
				opacity: 0.5;
			}
		}

		&.processing {
			.text {
				opacity: 0;
			}

			.spinner {
				opacity: 1;
			}
		}

		&:not(.processing) {
			.text {
				opacity: 1;
			}

			.spinner {
				opacity: 0;
			}
		}

		& span {
			color: var(--neutral-100);
		}
	}

	.primary {
		background-color: var(--primary-400);

		&:hover:not(:disabled) {
			background-color: var(--primary-500);
		}

		&:disabled {
			background-color: color-mix(in oklab, var(--primary-400) 50%, transparent);
		}

		.spinner i {
			color: var(--primary-100);
		}
	}

	.primary-text {
		padding: 0;
		background-color: transparent;
		border: none;

		&:hover:not(:disabled) .text {
			color: var(--primary-600);
		}

		&:disabled {
			color: color-mix(in oklab, var(--primary-400) 50%, transparent);
		}

		.text {
			color: var(--primary-500);
		}

		.spinner i {
			color: var(--primary-700);
		}
	}

	.secondary {
		background-color: var(--secondary-400);

		&:hover:not(:disabled) {
			background-color: var(--secondary-500);
		}

		&:disabled {
			background-color: color-mix(in oklab, var(--secondary-400) 50%, transparent);
		}

		.spinner i {
			color: var(--secondary-700);
		}
	}

	.secondary-text {
		padding: 0;
		background-color: transparent;
		border: none;

		&:hover:not(:disabled) .text {
			color: var(--secondary-600);
		}

		&:disabled {
			color: color-mix(in oklab, var(--secondary-400) 50%, transparent);
		}

		.text {
			color: var(--secondary-500);
		}

		.spinner i {
			color: var(--secondary-700);
		}
	}

	.tertiary {
		background-color: var(--secondary-400);

		&:hover:not(:disabled) {
			background-color: var(--secondary-500);
		}

		&:disabled {
			background-color: color-mix(in oklab, var(--secondary-400) 50%, transparent);
		}

		.spinner i {
			color: var(--secondary-700);
		}
	}

	.tertiary-text {
		padding: 0;
		background-color: transparent;
		border: none;

		&:hover:not(:disabled) .text {
			color: var(--secondary-600);
		}

		&:disabled {
			color: color-mix(in oklab, var(--secondary-400) 50%, transparent);
		}

		.text {
			color: var(--secondary-500);
		}

		.spinner i {
			color: var(--secondary-700);
		}
	}

	.neutral {
		background-color: var(--neutral-400);

		&:hover:not(:disabled) {
			background-color: var(--neutral-500);
		}

		&:disabled {
			background-color: color-mix(in oklab, var(--neutral-400) 50%, transparent);
		}

		.spinner i {
			color: var(--neutral-700);
		}
	}

	.neutral-text {
		padding: 0;
		background-color: transparent;
		border: none;

		&:hover:not(:disabled) .text {
			color: var(--neutral-600);
		}

		&:disabled {
			color: color-mix(in oklab, var(--neutral-400) 50%, transparent);
		}

		.text {
			color: var(--neutral-500);
		}

		.spinner i {
			color: var(--neutral-700);
		}
	}

	.light {
		background-color: var(--neutral-900);

		&:hover:not(:disabled) {
			background-color: var(--neutral-700);
		}

		&:disabled {
			background-color: color-mix(in oklab, var(--neutral-900) 50%, transparent);
		}

		.text {
			color: var(--neutral-100);
		}

		.spinner i {
			color: var(--neutral-700);
		}
	}

	.light-text {
		padding: 0;
		background-color: transparent;
		border: none;

		&:hover:not(:disabled) .text {
			color: var(--neutral-700);
		}

		&:disabled {
			color: color-mix(in oklab, var(--neutral-900) 50%, transparent);
		}

		.text {
			color: var(--neutral-900);
		}

		.spinner i {
			color: var(--neutral-700);
		}
	}

	.danger {
		background-color: var(--danger-400);

		&:hover:not(:disabled) {
			background-color: var(--danger-500);
		}

		&:disabled {
			background-color: color-mix(in oklab, var(--danger-400) 50%, transparent);
		}

		.spinner i {
			color: var(--danger-700);
		}
	}

	.danger-text {
		padding: 0;
		background-color: transparent;
		border: none;

		&:hover:not(:disabled) {
			color: var(--danger-600);
		}

		&:disabled {
			color: color-mix(in oklab, var(--danger-400) 50%, transparent);
		}

		.text {
			color: var(--danger-500);
		}

		.spinner i {
			color: var(--danger-700);
		}
	}

	.success {
		background-color: var(--success-400);

		&:hover:not(:disabled) {
			background-color: var(--success-500);
		}

		&:disabled {
			background-color: color-mix(in oklab, var(--success-400) 50%, transparent);
		}

		.spinner i {
			color: var(--success-700);
		}
	}

	.success-text {
		padding: 0;
		background-color: transparent;
		border: none;

		&:hover:not(:disabled) {
			color: var(--success-600);
		}

		&:disabled {
			color: color-mix(in oklab, var(--success-400) 50%, transparent);
		}

		.text {
			color: var(--success-500);
		}

		.spinner i {
			color: var(--success-700);
		}
	}

	.transparent {
		padding: 0.5rem;
		background-color: transparent;

		&:hover:not(:disabled) {
			color: var(--neutral-800);
		}

		&:disabled:not(.processing) .text {
			opacity: 0.5;
		}

		.spinner i {
			color: var(--primary-700);
		}
	}

	.spinner {
		--fa-primary-opacity: 0.9;
		--fa-primary-opacity: 1;

		position: absolute;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);

		i {
			font-size: 1.75rem;
		}
	}
</style>
