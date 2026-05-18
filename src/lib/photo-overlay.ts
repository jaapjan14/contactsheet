import { pushState } from '$app/navigation';

/**
 * Open a photo as a Darkroom-style modal overlay over the current grid.
 *
 * Pushes overlay state synchronously with just the photoId. The overlay
 * component then calls `preloadData(/photo/:id)` itself — which reuses any
 * in-flight hover-preload — and renders a loading state until the data is
 * available. The click feels instant (overlay backdrop appears within a
 * frame) instead of stalling on the server load before any feedback.
 *
 * Closing the overlay does `history.back()` to pop the pushState entry —
 * the grid below was never unmounted, so there's no scroll-restore, no
 * view-transition, no Safari gray-screen at depth.
 */
export function openPhoto(photoId: string): void {
	pushState(`/photo/${photoId}`, { photoOverlay: { photoId } });
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
	openPhoto(photoId);
}
