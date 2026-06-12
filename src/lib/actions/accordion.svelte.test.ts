import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { accordion } from './accordion';

/**
 * Tests for the accordion action's open/close state machine.
 *
 * jsdom implements neither the Web Animations API (`Element.animate`) nor
 * layout (`offsetHeight` is always 0), so both are stubbed. Stubbing `animate`
 * to return a controllable handle lets us drive `onfinish` by hand and assert
 * how the state machine settles, and stubbing `requestAnimationFrame` to run
 * synchronously means `open()` -> `expand()` completes within the click.
 */

interface FakeAnimation {
	cancel: ReturnType<typeof vi.fn>;
	onfinish: (() => void) | null;
	oncancel: (() => void) | null;
}

let animations: FakeAnimation[];

function makeDetails({ withSummary = true, withContent = true } = {}): HTMLDetailsElement {
	const el = document.createElement('details');
	if (withSummary) {
		const summary = document.createElement('summary');
		summary.textContent = 'Title';
		el.appendChild(summary);
	}
	if (withContent) {
		const content = document.createElement('div');
		content.className = 'content';
		el.appendChild(content);
	}
	document.body.appendChild(el);
	return el;
}

function clickSummary(el: HTMLDetailsElement): MouseEvent {
	const event = new MouseEvent('click', { cancelable: true, bubbles: true });
	el.querySelector('summary')!.dispatchEvent(event);
	return event;
}

describe('accordion action', () => {
	beforeEach(() => {
		animations = [];
		// jsdom does not implement the Web Animations API at all, so the property
		// must be defined rather than spied (vi.spyOn requires it to already exist).
		(Element.prototype as unknown as { animate: unknown }).animate = vi.fn(() => {
			const anim: FakeAnimation = { cancel: vi.fn(), onfinish: null, oncancel: null };
			animations.push(anim);
			return anim as unknown as Animation;
		});
		// jsdom reports 0 for every layout measurement; give a stable non-zero size.
		vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(50);
		// Run the rAF callback inline so expand() executes during the click.
		vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb: FrameRequestCallback) => {
			cb(0);
			return 0;
		});
	});

	afterEach(() => {
		vi.restoreAllMocks();
		delete (Element.prototype as unknown as { animate?: unknown }).animate;
		document.body.innerHTML = '';
	});

	it('suppresses the native toggle so the animation can drive open state', () => {
		const el = makeDetails();
		accordion(el);

		const event = clickSummary(el);

		expect(event.defaultPrevented).toBe(true);
	});

	it('opens a closed details and keeps it open when the expand finishes', () => {
		const el = makeDetails();
		accordion(el);
		expect(el.open).toBe(false);

		clickSummary(el);

		// open() flips `open` synchronously and starts one expand animation.
		expect(el.open).toBe(true);
		expect(animations).toHaveLength(1);

		animations[0].onfinish!();

		expect(el.open).toBe(true);
		// Inline height/overflow set during the animation are cleared on finish.
		expect(el.style.height).toBe('');
		expect(el.style.overflow).toBe('');
	});

	it('closes an open details only once the shrink animation finishes', () => {
		const el = makeDetails();
		accordion(el);

		clickSummary(el);
		animations[0].onfinish!(); // settle open
		expect(el.open).toBe(true);

		clickSummary(el);

		// Shrink is queued, but the element stays open until it completes.
		expect(animations).toHaveLength(2);
		expect(el.open).toBe(true);

		animations[1].onfinish!();

		expect(el.open).toBe(false);
	});

	it('cancels the in-flight animation when interrupted mid-expand', () => {
		const el = makeDetails();
		accordion(el);

		clickSummary(el); // expand starts (animations[0]), not yet finished
		clickSummary(el); // interrupt -> shrink

		expect(animations[0].cancel).toHaveBeenCalled();
		expect(animations).toHaveLength(2);
	});

	it('detaches the click handler on destroy', () => {
		const el = makeDetails();
		const handle = accordion(el);

		handle!.destroy();
		const event = clickSummary(el);

		// Handler gone: native toggle is no longer prevented and nothing animates.
		expect(event.defaultPrevented).toBe(false);
		expect(animations).toHaveLength(0);
	});

	it('bails and logs when the .content element is missing', () => {
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
		const el = makeDetails({ withContent: false });

		const handle = accordion(el);

		expect(handle).toBeUndefined();
		expect(consoleError).toHaveBeenCalled();

		clickSummary(el);
		expect(animations).toHaveLength(0);
	});

	it('bails and logs when the summary element is missing', () => {
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
		const el = makeDetails({ withSummary: false });

		const handle = accordion(el);

		expect(handle).toBeUndefined();
		expect(consoleError).toHaveBeenCalled();
	});
});
