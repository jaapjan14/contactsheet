/**
 * Image zoom controller — pinch / wheel / drag-pan / double-click.
 *
 * Framework-agnostic by design: this is plain DOM + transforms with no
 * Svelte/React/Vue dependencies, so the same file can be dropped into
 * Darkroom Log later. Attach with `makeZoomer(imgEl)` and call `.destroy()`
 * when done.
 *
 * Inputs handled:
 *   - ctrlKey + wheel  → zoom toward cursor (this is what macOS trackpad
 *                        pinch sends, and ctrl+wheel on a real mouse).
 *   - plain wheel      → pan when zoomed; bubbles when not zoomed (lets the
 *                        host page keep wheel-paging at 1×).
 *   - pointer (1)      → drag-to-pan when zoomed; bubbles when not.
 *   - pointer (2)      → pinch-to-zoom (anchored at the gesture midpoint).
 *   - double-click     → toggle 1× ↔ doubleTapScale, anchored at the cursor.
 *
 * The host page should check `.isZoomed()` before reacting to swipe gestures
 * so a pan doesn't accidentally trigger paging or close-on-swipe-up.
 */

export interface ZoomerOptions {
	minScale?: number;
	maxScale?: number;
	doubleTapScale?: number;
}

export interface Zoomer {
	isZoomed(): boolean;
	reset(): void;
	destroy(): void;
}

export function makeZoomer(img: HTMLImageElement, opts: ZoomerOptions = {}): Zoomer {
	const minScale = opts.minScale ?? 1;
	const maxScale = opts.maxScale ?? 8;
	const doubleTapScale = opts.doubleTapScale ?? 2.5;

	let scale = minScale;
	let tx = 0;
	let ty = 0;

	const pointers = new Map<number, { x: number; y: number }>();
	let pinchStartDist = 0;
	let pinchStartCenter = { x: 0, y: 0 };
	let pinchStartScale = minScale;
	let pinchStartTx = 0;
	let pinchStartTy = 0;

	// Manual double-tap detection for touch. iOS Safari does not reliably fire
	// `dblclick` when pointer-capture is active on the target, so we measure
	// time + distance between two `touch` pointerdowns ourselves. Mouse still
	// uses the native `dblclick` event below.
	let lastTapTime = 0;
	let lastTapX = 0;
	let lastTapY = 0;

	// Save originals so destroy() restores the element exactly as we found it.
	const orig = {
		transform: img.style.transform,
		transformOrigin: img.style.transformOrigin,
		transition: img.style.transition,
		touchAction: img.style.touchAction,
		cursor: img.style.cursor,
		userSelect: img.style.userSelect,
		willChange: img.style.willChange
	};

	img.style.transformOrigin = '0 0';
	img.style.touchAction = 'none';
	img.style.userSelect = 'none';

	// `will-change: transform` is a double-edged hint: it gives smooth GPU
	// transforms during a gesture, but on Safari it permanently composites
	// the <img> at element layout size (e.g. 2048px) and never re-rasterizes
	// from the source bitmap when transforms zoom in — so a 6K/Original src
	// looks no sharper than the 2048 display image. Firefox doesn't have this
	// problem because it re-rasterizes from the natural image source.
	//
	// Fix: set will-change ONLY during an active gesture, then drop it after
	// a short settle window. When idle, Safari re-rasterizes from the
	// high-res bitmap and the static-zoomed view becomes sharp. Re-applies
	// instantly on the next gesture frame.
	const WILL_CHANGE_RELEASE_MS = 220;
	let willChangeTimer: ReturnType<typeof setTimeout> | null = null;
	function flagGestureActive() {
		if (img.style.willChange !== 'transform') img.style.willChange = 'transform';
		if (willChangeTimer) clearTimeout(willChangeTimer);
		willChangeTimer = setTimeout(() => {
			img.style.willChange = '';
			willChangeTimer = null;
		}, WILL_CHANGE_RELEASE_MS);
	}

	function apply(animate = false) {
		img.style.transition = animate ? 'transform 0.18s ease-out' : 'none';
		img.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
		img.style.cursor = scale > minScale + 0.001 ? 'grab' : 'zoom-in';
		flagGestureActive();
	}

	// Constrain so an image larger than its container always covers it; if
	// smaller (e.g. portrait in landscape viewport at 1×), center it.
	function clamp() {
		if (scale <= minScale + 0.001) {
			scale = minScale;
			tx = 0;
			ty = 0;
			return;
		}
		const parent = img.parentElement;
		if (!parent) return;
		const baseW = img.clientWidth;
		const baseH = img.clientHeight;
		const dispW = baseW * scale;
		const dispH = baseH * scale;
		const baseLeft = img.offsetLeft;
		const baseTop = img.offsetTop;
		const pW = parent.clientWidth;
		const pH = parent.clientHeight;

		if (dispW <= pW) {
			tx = (pW - dispW) / 2 - baseLeft;
		} else {
			const minTx = pW - dispW - baseLeft;
			const maxTx = -baseLeft;
			tx = Math.min(maxTx, Math.max(minTx, tx));
		}
		if (dispH <= pH) {
			ty = (pH - dispH) / 2 - baseTop;
		} else {
			const minTy = pH - dispH - baseTop;
			const maxTy = -baseTop;
			ty = Math.min(maxTy, Math.max(minTy, ty));
		}
	}

	// Set scale anchored at a viewport point — the image-pixel under (cx, cy)
	// stays under (cx, cy) after the change. This is the geometry that makes
	// pinch and ctrl+wheel feel right.
	function zoomAt(cx: number, cy: number, newScale: number, animate = false) {
		newScale = Math.max(minScale, Math.min(maxScale, newScale));
		if (Math.abs(newScale - scale) < 0.0001) return;
		const baseLeft = img.offsetLeft;
		const baseTop = img.offsetTop;
		// Image-coord of cursor at current transform: (cx - baseLeft - tx) / scale
		const ix = (cx - baseLeft - tx) / scale;
		const iy = (cy - baseTop - ty) / scale;
		scale = newScale;
		tx = cx - baseLeft - ix * newScale;
		ty = cy - baseTop - iy * newScale;
		clamp();
		apply(animate);
	}

	// Normalize deltaY/deltaX to pixels regardless of WheelEvent.deltaMode
	// (Firefox with line-mode preferences sends deltaMode=1 with ~3px equivalents,
	// some old browsers send deltaMode=2 for page-mode). Without this, zoom
	// crawls and pan barely moves on those configs.
	function pxDelta(e: WheelEvent): { dx: number; dy: number } {
		const k = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? window.innerHeight : 1;
		return { dx: e.deltaX * k, dy: e.deltaY * k };
	}

	function onWheel(e: WheelEvent) {
		const { dx, dy } = pxDelta(e);
		// macOS trackpad pinch arrives as ctrlKey + wheel; same for ctrl+wheel
		// on a desktop mouse. Both should zoom.
		if (e.ctrlKey) {
			e.preventDefault();
			e.stopPropagation();
			const factor = Math.exp(-dy * 0.01);
			zoomAt(e.clientX, e.clientY, scale * factor);
			return;
		}
		// Plain wheel pans if we're zoomed; otherwise let the host page see
		// it (used for prev/next paging at 1×).
		if (scale > minScale + 0.001) {
			e.preventDefault();
			e.stopPropagation();
			tx -= dx;
			ty -= dy;
			clamp();
			apply();
		}
	}

	function toggleAt(cx: number, cy: number) {
		if (scale > minScale + 0.001) {
			scale = minScale;
			tx = 0;
			ty = 0;
			apply(true);
		} else {
			zoomAt(cx, cy, doubleTapScale, true);
		}
	}

	function onDblClick(e: MouseEvent) {
		e.preventDefault();
		e.stopPropagation();
		toggleAt(e.clientX, e.clientY);
	}

	function onPointerDown(e: PointerEvent) {
		pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
		try {
			img.setPointerCapture(e.pointerId);
		} catch {
			/* some browsers throw if the pointer is already captured */
		}
		if (pointers.size === 2) {
			const [a, b] = [...pointers.values()];
			pinchStartDist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
			pinchStartCenter = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
			pinchStartScale = scale;
			pinchStartTx = tx;
			pinchStartTy = ty;
			// Two fingers down — definitely not a double-tap.
			lastTapTime = 0;
			return;
		}
		// Manual double-tap detection for touch pointers (iOS doesn't fire
		// dblclick when we've captured the pointer).
		if (e.pointerType === 'touch' && pointers.size === 1) {
			const now = Date.now();
			const dx = e.clientX - lastTapX;
			const dy = e.clientY - lastTapY;
			if (now - lastTapTime < 300 && Math.hypot(dx, dy) < 30) {
				lastTapTime = 0;
				toggleAt(e.clientX, e.clientY);
			} else {
				lastTapTime = now;
				lastTapX = e.clientX;
				lastTapY = e.clientY;
			}
		}
	}

	function onPointerMove(e: PointerEvent) {
		if (!pointers.has(e.pointerId)) return;
		const prev = pointers.get(e.pointerId)!;
		pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

		if (pointers.size >= 2) {
			e.preventDefault();
			e.stopPropagation();
			const [a, b] = [...pointers.values()];
			const dist = Math.hypot(a.x - b.x, a.y - b.y);
			const center = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
			const newScale = Math.max(
				minScale,
				Math.min(maxScale, pinchStartScale * (dist / pinchStartDist))
			);
			const baseLeft = img.offsetLeft;
			const baseTop = img.offsetTop;
			// Image-coord of pinch midpoint at gesture start
			const ix = (pinchStartCenter.x - baseLeft - pinchStartTx) / pinchStartScale;
			const iy = (pinchStartCenter.y - baseTop - pinchStartTy) / pinchStartScale;
			scale = newScale;
			tx = center.x - baseLeft - ix * newScale;
			ty = center.y - baseTop - iy * newScale;
			clamp();
			apply();
		} else if (pointers.size === 1 && scale > minScale + 0.001) {
			e.preventDefault();
			e.stopPropagation();
			tx += e.clientX - prev.x;
			ty += e.clientY - prev.y;
			clamp();
			apply();
			img.style.cursor = 'grabbing';
		}
	}

	function onPointerUp(e: PointerEvent) {
		pointers.delete(e.pointerId);
		try {
			if (img.hasPointerCapture(e.pointerId)) img.releasePointerCapture(e.pointerId);
		} catch {
			/* noop */
		}
		if (pointers.size === 0) {
			img.style.cursor = scale > minScale + 0.001 ? 'grab' : 'zoom-in';
		}
	}

	apply();

	// Re-clamp on container resize: viewport rotation, devtools toggle,
	// browser-window resize while zoomed all change `parent.clientWidth/Height`,
	// and without re-clamping the image can slide off-screen with no recovery.
	let resizeObs: ResizeObserver | null = null;
	if (typeof ResizeObserver !== 'undefined' && img.parentElement) {
		resizeObs = new ResizeObserver(() => {
			if (scale > minScale + 0.001) {
				clamp();
				apply();
			}
		});
		resizeObs.observe(img.parentElement);
	}

	img.addEventListener('wheel', onWheel, { passive: false });
	img.addEventListener('dblclick', onDblClick);
	img.addEventListener('pointerdown', onPointerDown);
	img.addEventListener('pointermove', onPointerMove);
	img.addEventListener('pointerup', onPointerUp);
	img.addEventListener('pointercancel', onPointerUp);

	return {
		isZoomed: () => scale > minScale + 0.001,
		reset: () => {
			scale = minScale;
			tx = 0;
			ty = 0;
			apply(true);
		},
		destroy: () => {
			resizeObs?.disconnect();
			if (willChangeTimer) {
				clearTimeout(willChangeTimer);
				willChangeTimer = null;
			}
			img.removeEventListener('wheel', onWheel);
			img.removeEventListener('dblclick', onDblClick);
			img.removeEventListener('pointerdown', onPointerDown);
			img.removeEventListener('pointermove', onPointerMove);
			img.removeEventListener('pointerup', onPointerUp);
			img.removeEventListener('pointercancel', onPointerUp);
			img.style.transform = orig.transform;
			img.style.transformOrigin = orig.transformOrigin;
			img.style.transition = orig.transition;
			img.style.touchAction = orig.touchAction;
			img.style.cursor = orig.cursor;
			img.style.userSelect = orig.userSelect;
			img.style.willChange = orig.willChange;
		}
	};
}
