import { preloadData, pushState, goto } from '$app/navigation';
import type { PhotoViewData } from '$lib/components/PhotoView.svelte';

/**
 * Open a photo as a Darkroom-style modal overlay over the current grid.
 *
 * Preloads the same data the /photo/[id] route's `+page.server.ts` would
 * load, then `pushState`s a new history entry whose state carries that data.
 * The layout's `{#if $page.state.photoOverlay}` block then mounts
 * <PhotoOverlay>. Closing the overlay does `history.back()`, popping that
 * entry — the grid below was never unmounted, so there's no scroll-restore,
 * no view-transition, no Safari gray-screen at depth.
 *
 * Falls back to a real navigation if preload fails (e.g. 404, network).
 *
 * Returns true if the overlay opened, false if it fell through to a normal
 * navigation. Callers don't need the return value but it's there for tests.
 */
export async function openPhoto(photoId: string): Promise<boolean> {
	const href = `/photo/${photoId}`;
	try {
		const result = await preloadData(href);
		if (result.type === 'loaded' && result.status === 200) {
			pushState(href, {
				photoOverlay: { data: result.data as PhotoViewData }
			});
			return true;
		}
	} catch {
		/* fall through */
	}
	await goto(href);
	return false;
}

/**
 * Click handler for grid cells. Use as:
 *   <a href="/photo/{p.id}" onclick={(e) => onCellClick(e, p.id)}>
 *
 * Preserves cmd/ctrl/middle/shift-click → opens in new tab as expected.
 */
export function onCellClick(e: MouseEvent, photoId: string): void {
	if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
	e.preventDefault();
	void openPhoto(photoId);
}
