<script lang="ts">
	import { replaceState, preloadData } from '$app/navigation';
	import { fade } from 'svelte/transition';
	import PhotoView from '$lib/components/PhotoView.svelte';
	import type { PhotoViewData } from '$lib/components/PhotoView.svelte';

	// Darkroom-style modal: the grid below stays mounted, this overlay is
	// driven entirely by $page.state.photoOverlay (set via pushState in
	// openPhoto). Closing pops the pushState, which removes that state and
	// unmounts this component automatically — no real navigation, no Safari
	// scroll-restore, no gray screen on deep grids.
	let { data }: { data: PhotoViewData } = $props();

	function close() {
		// Pops the pushState entry openPhoto added → $page.state.photoOverlay
		// goes undefined → layout's {#if} unmounts this overlay → grid is
		// already mounted and at its scroll position underneath.
		if (typeof window !== 'undefined') window.history.back();
	}

	async function paginate(id: string) {
		// Preload the same data the standalone /photo/[id] route would have
		// loaded server-side, then replaceState so the URL + overlay state
		// flip in place without a history entry. Pages-through stay one
		// history step from the grid no matter how many photos the user
		// flips through.
		const result = await preloadData(`/photo/${id}`);
		if (result.type === 'loaded' && result.status === 200) {
			replaceState(`/photo/${id}`, {
				photoOverlay: { data: result.data as PhotoViewData }
			});
		} else {
			// Preload failed — fall back to a real navigation so the user
			// still gets the photo, just without the overlay nicety.
			window.location.href = `/photo/${id}`;
		}
	}

	// Lock the document scroll while the overlay is mounted. iOS Safari
	// ignores `overscroll-behavior: contain` once a touch swipe escapes a
	// scrollable child — without this lock, swiping down on the photo
	// scrolls the grid sitting underneath. Saving + restoring scrollY also
	// keeps the grid right where the user left it when the overlay closes.
	$effect(() => {
		if (typeof document === 'undefined') return;
		const scrollY = window.scrollY;
		const body = document.body;
		const prev = {
			position: body.style.position,
			top: body.style.top,
			left: body.style.left,
			right: body.style.right,
			width: body.style.width,
			overflow: body.style.overflow
		};
		body.style.position = 'fixed';
		body.style.top = `-${scrollY}px`;
		body.style.left = '0';
		body.style.right = '0';
		body.style.width = '100%';
		body.style.overflow = 'hidden';

		// Distinguish "closing back to the grid" (popstate — close button,
		// browser back, iOS swipe) from "forward navigation to a new page"
		// (link click in the lightbox: photographer name, comment author,
		// "in groups" chip). Only the former should restore the grid's
		// saved scrollY — otherwise the new page is yanked down to wherever
		// the previous grid was, landing the user in a "random area" with
		// half-loaded cells they can't click.
		let cameFromPopstate = false;
		const onPop = () => {
			cameFromPopstate = true;
		};
		window.addEventListener('popstate', onPop);

		return () => {
			window.removeEventListener('popstate', onPop);
			body.style.position = prev.position;
			body.style.top = prev.top;
			body.style.left = prev.left;
			body.style.right = prev.right;
			body.style.width = prev.width;
			body.style.overflow = prev.overflow;
			if (cameFromPopstate) {
				// Closing back to the underlying grid — restore the exact
				// scroll position it had when the overlay opened.
				window.scrollTo(0, scrollY);
			}
			// Forward nav: let SvelteKit's default scroll-to-top for the
			// new route stand. (It's already run by the time we get here,
			// 220ms after the out-fade started.)
		};
	});
</script>

<!-- `out:fade` only — open is instant; close fades over 220ms. The fade
     window absorbs leftover swipe inertia visually so dismiss doesn't snap.
     Mirrors Darkroom Log's `recent-detail-view.dismissing` pattern (its
     overlay also has a `transition: opacity 0.22s ease`). The body-scroll
     lock $effect's cleanup runs when this component is unmounted (which
     is after the out-transition completes), so the grid stays locked for
     the full fade and is only revealed when the overlay is fully gone. -->
<div
	class="overlay"
	role="dialog"
	aria-modal="true"
	aria-label={data.photo.title._content || 'Photo'}
	out:fade={{ duration: 220 }}
>
	<PhotoView {data} onclose={close} onpaginate={paginate} />
</div>

<style>
	.overlay {
		position: fixed;
		inset: 0;
		z-index: 1000;
		/* Hard hex (not var) so a misconfigured CSS variable inheritance
		   can't accidentally render the overlay translucent. Matches --bg
		   from the layout. */
		background: #111111;
		overflow-y: auto;
		overscroll-behavior: contain;
		-webkit-overflow-scrolling: touch;
	}
</style>
