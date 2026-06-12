/**
 * Svelte action that animates the open/close of a native <details> element.
 *
 * <details> does not animate by default — it snaps open and shut. This wraps it
 * with the Web Animations API to tween the element's height, following the
 * technique from https://css-tricks.com/how-to-animate-the-details-element/.
 *
 * The element must contain a <summary> and a `.content` wrapper:
 *
 *   <details use:accordion>
 *     <summary>Title</summary>
 *     <div class="content">...</div>
 *   </details>
 *
 * Applied per-element via `use:accordion`, so it composes with an {#each} list
 * of independently collapsible sections.
 */
class Accordion {
	private el: HTMLDetailsElement;
	private summary: HTMLElement;
	private content: HTMLElement;
	private animation: Animation | null = null;
	private isClosing = false;
	private isExpanding = false;

	constructor(el: HTMLDetailsElement) {
		this.el = el;
		this.summary = el.querySelector('summary')!;
		this.content = el.querySelector('.content')!;
		this.summary.addEventListener('click', this.onClick);
	}

	destroy = () => {
		this.summary.removeEventListener('click', this.onClick);
		this.animation?.cancel();
	};

	private onClick = (e: MouseEvent) => {
		e.preventDefault();
		this.el.style.overflow = 'hidden';

		if (this.isClosing || !this.el.open) {
			this.open();
		} else if (this.isExpanding || this.el.open) {
			this.shrink();
		}
	};

	private shrink = () => {
		this.isClosing = true;

		const startHeight = `${this.el.offsetHeight}px`;
		const endHeight = `${this.summary.offsetHeight}px`;

		this.animation?.cancel();
		this.animation = this.el.animate(
			{ height: [startHeight, endHeight] },
			{ duration: 300, easing: 'ease-in-out' }
		);

		this.animation.onfinish = () => this.onAnimationFinish(false);
		this.animation.oncancel = () => (this.isClosing = false);
	};

	private open = () => {
		this.el.style.height = `${this.el.offsetHeight}px`;
		this.el.open = true;
		window.requestAnimationFrame(this.expand);
	};

	private expand = () => {
		this.isExpanding = true;

		const startHeight = `${this.el.offsetHeight}px`;
		const endHeight = `${this.summary.offsetHeight + this.content.offsetHeight}px`;

		this.animation?.cancel();
		this.animation = this.el.animate(
			{ height: [startHeight, endHeight] },
			{ duration: 400, easing: 'ease-out' }
		);

		this.animation.onfinish = () => this.onAnimationFinish(true);
		this.animation.oncancel = () => (this.isExpanding = false);
	};

	private onAnimationFinish = (open: boolean) => {
		this.el.open = open;
		this.animation = null;
		this.isClosing = false;
		this.isExpanding = false;
		this.el.style.height = this.el.style.overflow = '';
	};
}

export function accordion(el: HTMLDetailsElement) {
	const instance = new Accordion(el);
	return {
		destroy: instance.destroy
	};
}
