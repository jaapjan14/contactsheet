<script lang="ts">
	import { replaceState, preloadData } from '$app/navigation';
	import { fade } from 'svelte/transition';
	import PhotoView from '$lib/components/PhotoView.svelte';
	import type { PhotoViewData } from '$lib/components/PhotoView.svelte';

	// Darkroom-style modal: the grid below stays mounted, this overlay is
	// driven entirely by $page.state.photoOverlay (set via pushState in
	// openPhoto). State carries only the photoId — pushState state must be
	// JSON-serializable, and the load returns streamed Promises that aren't
	// cloneable. The overlay does its own preloadData() per photoId, which
	// reuses SvelteKit's hover-preload cache when available.
	//
	// Closing pops the pushState, which removes that state and unmounts this
	// component automatically — no real navigation, no Safari scroll-restore,
	// no gray screen on deep grids.
	let { photoId }: { photoId: string } = $props();

	let data: PhotoViewData | null = $state(null);
	let loadError: string | null = $state(null);

	function close() {
		// Pops the pushState entry openPhoto added → $page.state.photoOverlay
		// goes undefined → layout's {#if} unmounts this overlay → grid is
		// already mounted and at its scroll position underneath.
		if (typeof window !== 'undefined') window.history.back();
	}

	// Load (or reload) data when photoId changes. The previous render keeps
	// showing the old image while the new one resolves — that's the right call
	// because the click feedback (URL change + active state) has already fired
	// and the user expects the page to update, not blank out. A token guards
	// against an older preload arriving after a faster newer one.
	let loadToken = 0;
	$effect(() => {
		const id = photoId;
		const token = ++loadToken;
		loadError = null;
		preloadData(`/photo/${id}`)
			.then((result) => {
				if (token !== loadToken) return;
				if (result.type === 'loaded' && result.status === 200) {
					data = result.data as PhotoViewData;
				} else if (result.type === 'redirect') {
					window.location.href = result.location;
				} else {
					// Load failed — fall through to a real navigation so the user
					// still gets the photo (or a real 404 page), just without the
					// overlay nicety.
					window.location.href = `/photo/${id}`;
				}
			})
			.catch(() => {
				if (token !== loadToken) return;
				loadError = 'Failed to load photo.';
			});
	});

	function paginate(id: string) {
		// replaceState with the new photoId — the $effect above sees the prop
		// change and reloads. Stays one history step from the grid no matter how
		// many photos the user pages through.
		replaceState(`/photo/${id}`, { photoOverlay: { photoId: id } });
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
				window.scrollTo(0, scrollY);
			}
		};
	});
</script>

<!-- `out:fade` only — open is instant; close fades over 220ms. The fade
     window absorbs leftover swipe inertia visually so dismiss doesn't snap.
     Mirrors Darkroom Log's `recent-detail-view.dismissing` pattern. The
     body-scroll lock $effect's cleanup runs when this component is unmounted
     (after the out-transition completes), so the grid stays locked for the
     full fade and is only revealed when the overlay is fully gone. -->
<div
	class="overlay"
	role="dialog"
	aria-modal="true"
	aria-label={data?.photo.title._content || 'Photo'}
	out:fade={{ duration: 220 }}
>
	{#if data}
		<PhotoView {data} onclose={close} onpaginate={paginate} />
	{:else if loadError}
		<div class="overlay-state">
			<p>{loadError}</p>
			<button type="button" class="overlay-btn" onclick={close}>← back</button>
		</div>
	{:else}
		<!-- Pending state: blank backdrop. Showing the overlay backdrop is the
		     visual ack that the click registered; a spinner would just add noise
		     for a typical sub-300ms wait. -->
		<div class="overlay-state" aria-busy="true" aria-label="Loading photo"></div>
	{/if}
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
	.overlay-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		min-height: 100dvh;
		color: #888;
		font-family: 'IBM Plex Sans', system-ui, sans-serif;
		gap: 1rem;
	}
	.overlay-btn {
		background: transparent;
		border: 1px solid #2a2a2a;
		color: #e8e8e8;
		padding: 0.5rem 1rem;
		font: inherit;
		cursor: pointer;
		border-radius: 4px;
	}
	.overlay-btn:hover {
		border-color: #ff7a3d;
	}
</style>
