<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { goto, preloadData } from '$app/navigation';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const photo = $derived(data.photo);
	const display = $derived(data.display);
	const ownerHref = $derived(
		`/user/${photo.owner.path_alias || photo.owner.nsid}/photostream`
	);
	const ownerName = $derived(photo.owner.realname || photo.owner.username);
	const tags = $derived(photo.tags?.tag.filter((t) => !t.machine_tag) ?? []);
	const flickrPageUrl = $derived(
		photo.urls?.url.find((u) => u.type === 'photopage')?._content
	);
	const isOwner = $derived(data.me?.nsid === photo.owner.nsid);

	const contextLabel = $derived.by((): string => {
		if (!streamCtx) return `${ownerName}'s photostream`;
		if (streamCtx.albumId) return 'album';
		if (streamCtx.groupId) return 'group';
		if (streamCtx.galleryId) return 'gallery';
		const map: Record<string, string> = {
			photostream: 'photostream',
			albums: 'albums',
			faves: 'faves',
			galleries: 'galleries',
			groups: 'groups',
			'camera-roll': 'camera roll',
			stats: 'stats'
		};
		return map[streamCtx.tab] ?? streamCtx.tab;
	});

	// Local copies that update on save — keeps UI snappy without a full page reload
	let liveTitle = $state(untrack(() => data.photo.title._content || ''));
	let liveDesc = $state(untrack(() => data.photo.description._content || ''));
	let lastPhotoId = $state(untrack(() => data.photo.id));

	$effect(() => {
		if (data.photo.id !== lastPhotoId) {
			lastPhotoId = data.photo.id;
			liveTitle = data.photo.title._content || '';
			liveDesc = data.photo.description._content || '';
		}
	});

	let editingTitle = $state(false);
	let editingDesc = $state(false);
	let titleDraft = $state('');
	let descDraft = $state('');
	let saving = $state(false);
	let saveError: string | null = $state(null);

	function startEditTitle() {
		titleDraft = liveTitle;
		editingTitle = true;
	}
	function startEditDesc() {
		descDraft = liveDesc;
		editingDesc = true;
	}
	function cancelEdit() {
		editingTitle = false;
		editingDesc = false;
		saveError = null;
	}

	async function save() {
		if (saving) return;
		saving = true;
		saveError = null;
		const newTitle = editingTitle ? titleDraft : liveTitle;
		const newDesc = editingDesc ? descDraft : liveDesc;
		try {
			const res = await fetch(`/api/photo/${photo.id}/meta`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ title: newTitle, description: newDesc })
			});
			if (!res.ok) {
				const text = await res.text();
				throw new Error(text || `HTTP ${res.status}`);
			}
			liveTitle = newTitle;
			liveDesc = newDesc;
			editingTitle = false;
			editingDesc = false;
		} catch (err) {
			saveError = (err as Error).message;
		} finally {
			saving = false;
		}
	}

	const shotDetails = $derived.by(() => {
		if (!data.exif) return null;
		const find = (tag: string): string | null => {
			const e = data.exif!.exif.find((x) => x.tag === tag);
			return e?.clean?._content ?? e?.raw._content ?? null;
		};
		const detail = {
			camera: data.exif.camera || null,
			lens: find('LensModel') ?? find('Lens'),
			focal: find('FocalLength'),
			aperture: find('FNumber'),
			shutter: find('ExposureTime'),
			iso: find('ISO') ?? find('ISOSpeedRatings')
		};
		const hasAny = Object.values(detail).some((v) => v);
		return hasAny ? detail : null;
	});

	function decodeAndStripHtml(s: string): string {
		// Strip tags first, then decode the most common entities
		const stripped = s.replace(/<[^>]+>/g, '');
		return stripped
			.replace(/&amp;/g, '&')
			.replace(/&lt;/g, '<')
			.replace(/&gt;/g, '>')
			.replace(/&quot;/g, '"')
			.replace(/&#39;/g, "'");
	}

	function formatCommentDate(epoch: string): string {
		const ms = parseInt(epoch, 10) * 1000;
		if (!Number.isFinite(ms)) return '';
		return new Date(ms).toLocaleDateString(undefined, {
			year: 'numeric',
			month: 'short',
			day: 'numeric'
		});
	}

	type StreamCtx =
		| { ids: string[]; userKey: string; tab: string; albumId?: undefined; groupId?: undefined; galleryId?: undefined }
		| { ids: string[]; albumId: string; tab: 'album'; userKey?: undefined; groupId?: undefined; galleryId?: undefined }
		| { ids: string[]; groupId: string; tab: 'group'; userKey?: undefined; albumId?: undefined; galleryId?: undefined }
		| { ids: string[]; galleryId: string; tab: 'gallery'; userKey?: undefined; albumId?: undefined; groupId?: undefined };

	let streamCtx = $state<StreamCtx | null>(null);
	let position = $derived(streamCtx ? streamCtx.ids.indexOf(photo.id) : -1);
	let prevId = $derived(streamCtx && position > 0 ? streamCtx.ids[position - 1] : null);
	let nextId = $derived(
		streamCtx && position >= 0 && position < streamCtx.ids.length - 1
			? streamCtx.ids[position + 1]
			: null
	);
	let backHref = $derived(
		streamCtx
			? streamCtx.albumId
				? `/album/${streamCtx.albumId}`
				: streamCtx.groupId
					? `/group/${streamCtx.groupId}`
					: streamCtx.galleryId
						? `/gallery/${streamCtx.galleryId}`
						: `/user/${streamCtx.userKey}/${streamCtx.tab}`
			: ownerHref
	);

	let fullscreen = $state(false);
	let figureEl: HTMLElement | null = $state(null);

	// Bumped from 90 → 180 so a casual two-finger horizontal swipe (which on Mac
	// also competes with the browser back-gesture) doesn't accidentally page the
	// photo. Keyboard arrows + click on the on-screen prev/next chevrons remain
	// the precise paging inputs.
	const SWIPE_PX = 180;
	let cooldownUntil = 0;
	let wheelAccum = 0;

	function pageTo(id: string | null) {
		if (!id) return;
		const now = Date.now();
		if (now < cooldownUntil) return;
		cooldownUntil = now + 350;
		// replaceState so the grid stays one history step away no matter how many
		// photos the user pages through — Esc / X / swipe-down restore the grid scroll
		goto(`/photo/${id}`, { replaceState: true, noScroll: true });
	}

	function close() {
		// If we came from a grid in this tab, history.back() restores scroll natively.
		// If deep-linked (no referrer in our origin), fall back to a fresh navigation.
		const sameOriginReferrer =
			typeof document !== 'undefined' &&
			document.referrer &&
			new URL(document.referrer).origin === window.location.origin;
		if (sameOriginReferrer && window.history.length > 1) {
			window.history.back();
		} else {
			goto(backHref);
		}
	}

	function onFigureClick(e: MouseEvent) {
		const target = e.target as HTMLElement;
		// Don't toggle fullscreen if the click landed on a nav arrow or icon button
		if (target.closest('a.nav, .iconbtn')) return;
		fullscreen = !fullscreen;
	}

	function onNavClick(e: MouseEvent, id: string | null) {
		// Allow cmd/middle/shift-click to open in new tab as usual
		if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
		e.preventDefault();
		pageTo(id);
	}

	onMount(() => {
		try {
			const raw = sessionStorage.getItem('contactsheet:stream');
			if (raw) streamCtx = JSON.parse(raw);
		} catch {
			/* ignore */
		}

		const handler = (e: KeyboardEvent) => {
			if (e.metaKey || e.ctrlKey || e.altKey) return;
			if (e.key === 'ArrowLeft') {
				e.preventDefault();
				pageTo(prevId);
			} else if (e.key === 'ArrowRight') {
				e.preventDefault();
				pageTo(nextId);
			} else if (e.key === 'Escape') {
				e.preventDefault();
				if (fullscreen) fullscreen = false;
				else close();
			} else if (e.key === 'f' || e.key === 'F') {
				e.preventDefault();
				fullscreen = !fullscreen;
			}
		};
		window.addEventListener('keydown', handler);
		return () => window.removeEventListener('keydown', handler);
	});

	$effect(() => {
		if (!figureEl) return;

		const onWheel = (e: WheelEvent) => {
			if (Math.abs(e.deltaX) < Math.abs(e.deltaY) * 1.2) {
				wheelAccum = 0;
				return;
			}
			e.preventDefault();
			if (Date.now() < cooldownUntil) return;
			wheelAccum += e.deltaX;
			if (wheelAccum > SWIPE_PX) {
				wheelAccum = 0;
				pageTo(nextId);
			} else if (wheelAccum < -SWIPE_PX) {
				wheelAccum = 0;
				pageTo(prevId);
			}
		};

		let touchStartX = 0;
		let touchStartY = 0;
		const onTouchStart = (e: TouchEvent) => {
			touchStartX = e.touches[0].clientX;
			touchStartY = e.touches[0].clientY;
		};
		const onTouchEnd = (e: TouchEvent) => {
			const dx = e.changedTouches[0].clientX - touchStartX;
			const dy = e.changedTouches[0].clientY - touchStartY;
			const absX = Math.abs(dx);
			const absY = Math.abs(dy);
			// Vertical swipe (either direction) closes the lightbox — preserves scroll
			if (absY > SWIPE_PX && absY > absX * 1.5) {
				if (Date.now() < cooldownUntil) return;
				cooldownUntil = Date.now() + 350;
				close();
				return;
			}
			// Horizontal swipe pages
			if (absX > SWIPE_PX && absX > absY * 1.5) {
				pageTo(dx < 0 ? nextId : prevId);
			}
		};

		figureEl.addEventListener('wheel', onWheel, { passive: false });
		figureEl.addEventListener('touchstart', onTouchStart, { passive: true });
		figureEl.addEventListener('touchend', onTouchEnd, { passive: true });
		return () => {
			figureEl?.removeEventListener('wheel', onWheel);
			figureEl?.removeEventListener('touchstart', onTouchStart);
			figureEl?.removeEventListener('touchend', onTouchEnd);
		};
	});

	$effect(() => {
		if (prevId) preloadData(`/photo/${prevId}`);
		if (nextId) preloadData(`/photo/${nextId}`);
	});
</script>

<article class:fullscreen>
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
	<figure bind:this={figureEl} onclick={onFigureClick}>
		<img
			src={display.source}
			width={display.width}
			height={display.height}
			alt={photo.title._content}
			style="view-transition-name: photo-{photo.id};"
		/>
		{#if prevId}
			<a
				class="nav prev"
				href="/photo/{prevId}"
				onclick={(e) => onNavClick(e, prevId)}
				aria-label="Previous photo"
			>
				‹
			</a>
		{/if}
		{#if nextId}
			<a
				class="nav next"
				href="/photo/{nextId}"
				onclick={(e) => onNavClick(e, nextId)}
				aria-label="Next photo"
			>
				›
			</a>
		{/if}
		{#if streamCtx && position >= 0}
			<span class="counter">{position + 1} / {streamCtx.ids.length}</span>
		{/if}
		<button
			type="button"
			class="iconbtn full"
			onclick={() => (fullscreen = !fullscreen)}
			aria-label={fullscreen ? 'Exit fullscreen' : 'Fullscreen'}
			title="Fullscreen (F)"
		>
			{#if fullscreen}⤢{:else}⤡{/if}
		</button>
		<button type="button" class="iconbtn close" onclick={close} aria-label="Close" title="Close (Esc)">
			✕
		</button>
	</figure>
	<aside>
		<button type="button" class="back-link" onclick={close}>
			← Back to {contextLabel}
		</button>

		{#if editingTitle}
			<form class="edit" onsubmit={(e) => { e.preventDefault(); save(); }}>
				<!-- svelte-ignore a11y_autofocus -->
				<input
					class="edit-title"
					type="text"
					bind:value={titleDraft}
					maxlength="200"
					placeholder="Untitled"
					autofocus
				/>
			</form>
		{:else}
			<h1>
				{liveTitle || 'Untitled'}
				{#if isOwner}
					<button
						type="button"
						class="edit-btn"
						onclick={startEditTitle}
						aria-label="Edit title"
						title="Edit title"
					>
						✎
					</button>
				{/if}
			</h1>
		{/if}
		<p class="byline">
			by <a href={ownerHref}>{ownerName}</a>
			{#if photo.dates.taken} · <time>{photo.dates.taken.split(' ')[0]}</time>{/if}
			{#if photo.views} · {Number(photo.views).toLocaleString()} views{/if}
		</p>

		{#if editingDesc}
			<form class="edit" onsubmit={(e) => { e.preventDefault(); save(); }}>
				<textarea
					class="edit-desc"
					bind:value={descDraft}
					rows="6"
					placeholder="Description"
				></textarea>
			</form>
		{:else if liveDesc.trim()}
			<p class="desc">
				{liveDesc.trim()}
				{#if isOwner}
					<button
						type="button"
						class="edit-btn inline"
						onclick={startEditDesc}
						aria-label="Edit description"
						title="Edit description"
					>
						✎
					</button>
				{/if}
			</p>
		{:else if isOwner}
			<p class="desc empty">
				<button
					type="button"
					class="edit-btn-text"
					onclick={startEditDesc}
				>
					+ add description
				</button>
			</p>
		{/if}

		{#if editingTitle || editingDesc}
			<div class="edit-actions">
				<button class="btn primary" onclick={save} disabled={saving}>
					{saving ? 'saving…' : 'save'}
				</button>
				<button class="btn" onclick={cancelEdit} disabled={saving}>cancel</button>
				{#if saveError}
					<span class="save-error">{saveError}</span>
				{/if}
			</div>
		{/if}

		{#if tags.length > 0}
			<ul class="tags">
				{#each tags as tag}
					<li>{tag.raw}</li>
				{/each}
			</ul>
		{/if}

		{#if photo.location}
			<p class="loc">
				📍
				{[
					photo.location.locality?._content,
					photo.location.region?._content,
					photo.location.country?._content
				]
					.filter(Boolean)
					.join(', ')}
			</p>
		{/if}

		{#if shotDetails}
			<section class="shot">
				<h3>Shot details</h3>
				<dl>
					{#if shotDetails.camera}
						<dt>Camera</dt>
						<dd>{shotDetails.camera}</dd>
					{/if}
					{#if shotDetails.lens}
						<dt>Lens</dt>
						<dd>{shotDetails.lens}</dd>
					{/if}
					{#if shotDetails.focal}
						<dt>Focal</dt>
						<dd>{shotDetails.focal}</dd>
					{/if}
					{#if shotDetails.aperture}
						<dt>Aperture</dt>
						<dd>{shotDetails.aperture}</dd>
					{/if}
					{#if shotDetails.shutter}
						<dt>Shutter</dt>
						<dd>{shotDetails.shutter}</dd>
					{/if}
					{#if shotDetails.iso}
						<dt>ISO</dt>
						<dd>{shotDetails.iso}</dd>
					{/if}
				</dl>
			</section>
		{/if}

		{#if data.comments.length > 0}
			<section class="comments">
				<h3>Comments ({data.comments.length})</h3>
				{#each data.comments as c (c.id)}
					<article class="comment">
						<header>
							<a href="/user/{c.path_alias || c.author}/photostream">
								{c.realname || c.authorname}
							</a>
							<time>{formatCommentDate(c.datecreate)}</time>
						</header>
						<p>{decodeAndStripHtml(c._content)}</p>
					</article>
				{/each}
			</section>
		{/if}

		<p class="links">
			<a href={backHref}>← back to {ownerName}'s photostream</a>
			{#if flickrPageUrl} · <a href={flickrPageUrl} target="_blank" rel="noopener">on flickr.com</a>{/if}
		</p>
		{#if streamCtx}
			<p class="hint">← / → or swipe to page · click or F for fullscreen · esc / swipe ↕ to close</p>
		{/if}
	</aside>
</article>

<style>
	article {
		max-width: 100rem;
		margin: 1.5rem auto;
		padding: 0 1.5rem;
		display: grid;
		grid-template-columns: minmax(0, 1fr) 22rem;
		gap: 2rem;
	}
	@media (max-width: 1024px) {
		article {
			grid-template-columns: 1fr;
		}
	}
	figure {
		margin: 0;
		background: var(--bg-elev);
		border-radius: 4px;
		overflow: hidden;
		position: relative;
	}
	.nav {
		position: absolute;
		top: 0;
		bottom: 0;
		width: 4rem;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 2.5rem;
		font-family: var(--font-sans);
		font-weight: 300;
		color: rgba(255, 255, 255, 0.55);
		background: linear-gradient(to right, rgba(0, 0, 0, 0.35), transparent);
		text-decoration: none;
		opacity: 0;
		transition: opacity 0.15s ease;
	}
	.nav.next {
		left: auto;
		right: 0;
		background: linear-gradient(to left, rgba(0, 0, 0, 0.35), transparent);
	}
	.nav.prev {
		left: 0;
	}
	figure:hover .nav {
		opacity: 1;
	}
	.nav:hover {
		color: #fff;
		text-decoration: none;
	}
	.counter {
		position: absolute;
		bottom: 0.75rem;
		right: 0.75rem;
		font-family: var(--font-mono);
		font-size: 0.75rem;
		color: rgba(255, 255, 255, 0.7);
		background: rgba(0, 0, 0, 0.55);
		padding: 0.2rem 0.55rem;
		border-radius: 2px;
	}
	.iconbtn {
		position: absolute;
		top: 0.6rem;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 2.1rem;
		height: 2.1rem;
		border-radius: 50%;
		background: rgba(0, 0, 0, 0.7);
		color: rgba(255, 255, 255, 0.95);
		font-size: 0.95rem;
		font-family: var(--font-sans);
		text-decoration: none;
		border: none;
		cursor: pointer;
		opacity: 1;
		transition: opacity 0.15s ease, background 0.15s ease;
	}
	.iconbtn.close {
		right: 0.6rem;
	}
	.iconbtn.full {
		right: 3.2rem;
	}
	.iconbtn:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}
	.iconbtn:hover {
		background: rgba(0, 0, 0, 0.85);
		color: #fff;
		text-decoration: none;
	}
	article.fullscreen {
		position: fixed;
		inset: 0;
		z-index: 200;
		max-width: none;
		margin: 0;
		padding: 0;
		grid-template-columns: 1fr;
		background: #000;
	}
	article.fullscreen aside {
		display: none;
	}
	article.fullscreen figure {
		width: 100%;
		height: 100%;
		margin: 0;
		border-radius: 0;
		display: flex;
		align-items: center;
		justify-content: center;
	}
	article.fullscreen figure img {
		max-height: 100vh;
		max-width: 100vw;
		width: auto;
		height: auto;
		object-fit: contain;
	}
	article.fullscreen .iconbtn {
		opacity: 0.4;
	}
	.hint {
		font-family: var(--font-mono);
		font-size: 0.7rem;
		color: var(--fg-muted);
		margin: 0.5rem 0 0;
	}
	figure img {
		display: block;
		width: 100%;
		height: auto;
		max-height: 85vh;
		object-fit: contain;
		background: #000;
		cursor: zoom-in;
	}
	article.fullscreen figure img {
		cursor: zoom-out;
	}
	aside {
		font-family: var(--font-sans);
	}
	.back-link {
		display: inline-block;
		background: var(--bg-elev);
		border: 1px solid var(--border);
		color: var(--fg);
		font-family: var(--font-mono);
		font-size: 0.78rem;
		padding: 0.4rem 0.85rem;
		border-radius: 3px;
		cursor: pointer;
		margin-bottom: 1rem;
	}
	.back-link:hover {
		border-color: var(--accent);
		color: var(--accent);
	}
	h1 {
		margin: 0 0 0.5rem;
		font-weight: 500;
		font-size: 1.5rem;
		letter-spacing: -0.01em;
		display: flex;
		align-items: center;
		gap: 0.4rem;
	}
	.edit-btn,
	.edit-btn-text {
		background: none;
		border: none;
		color: var(--fg-muted);
		cursor: pointer;
		font-size: 0.85rem;
		padding: 0.15rem 0.35rem;
		border-radius: 2px;
		transition: color 0.1s ease, background 0.1s ease;
	}
	.edit-btn:hover,
	.edit-btn-text:hover {
		color: var(--accent);
		background: var(--bg-elev);
	}
	.edit-btn.inline {
		font-size: 0.7rem;
		vertical-align: baseline;
		margin-left: 0.25rem;
	}
	.edit-btn-text {
		font-family: var(--font-mono);
		font-size: 0.85rem;
	}
	.edit-title,
	.edit-desc {
		width: 100%;
		background: var(--bg-elev);
		border: 1px solid var(--border);
		color: var(--fg);
		padding: 0.5rem 0.6rem;
		font-family: var(--font-sans);
		font-size: 1rem;
		border-radius: 3px;
		outline: none;
		box-sizing: border-box;
	}
	.edit-title {
		font-size: 1.5rem;
		font-weight: 500;
		letter-spacing: -0.01em;
	}
	.edit-desc {
		resize: vertical;
		min-height: 5rem;
		line-height: 1.45;
	}
	.edit-title:focus,
	.edit-desc:focus {
		border-color: var(--accent);
	}
	.edit-actions {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin: 0.5rem 0 1rem;
	}
	.btn {
		background: var(--bg-elev);
		border: 1px solid var(--border);
		color: var(--fg);
		padding: 0.4rem 0.9rem;
		font-family: var(--font-mono);
		font-size: 0.78rem;
		border-radius: 3px;
		cursor: pointer;
	}
	.btn.primary {
		background: var(--accent);
		color: #111;
		border-color: var(--accent);
	}
	.btn:hover:not(:disabled) {
		filter: brightness(1.1);
	}
	.btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
	.save-error {
		font-family: var(--font-mono);
		font-size: 0.75rem;
		color: #d96a6a;
	}
	.desc.empty {
		margin-top: 0.5rem;
	}
	.byline {
		color: var(--fg-muted);
		font-family: var(--font-mono);
		font-size: 0.8rem;
		margin: 0 0 1.5rem;
	}
	.desc {
		white-space: pre-wrap;
		color: #c8c8c8;
		font-size: 0.95rem;
		line-height: 1.55;
		margin: 0 0 1.5rem;
	}
	.tags {
		list-style: none;
		padding: 0;
		margin: 0 0 1.5rem;
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
	}
	.tags li {
		font-family: var(--font-mono);
		font-size: 0.75rem;
		color: var(--fg-muted);
		background: var(--bg-elev);
		border: 1px solid var(--border);
		padding: 0.15rem 0.5rem;
		border-radius: 2px;
	}
	.loc {
		font-family: var(--font-mono);
		font-size: 0.8rem;
		color: var(--fg-muted);
		margin: 0 0 1.5rem;
	}
	.shot,
	.comments {
		margin: 1.5rem 0;
		padding-top: 1rem;
		border-top: 1px solid var(--border);
	}
	.shot h3,
	.comments h3 {
		margin: 0 0 0.75rem;
		font-family: var(--font-mono);
		font-size: 0.7rem;
		font-weight: 500;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--fg-muted);
	}
	.shot dl {
		display: grid;
		grid-template-columns: max-content 1fr;
		gap: 0.35rem 1rem;
		margin: 0;
	}
	.shot dt {
		font-family: var(--font-mono);
		font-size: 0.75rem;
		color: var(--fg-muted);
	}
	.shot dd {
		margin: 0;
		font-family: var(--font-mono);
		font-size: 0.8rem;
		color: #c8c8c8;
	}
	.comment {
		/* Override the generic `article { display: grid }` rule from the page
		   layout — `<article class="comment">` is a flow-content block, not a
		   2-column grid. */
		display: block;
		padding: 0.6rem 0;
		border-bottom: 1px solid var(--border);
	}
	.comment:last-child {
		border-bottom: none;
	}
	.comment header {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		gap: 0.5rem;
		margin-bottom: 0.3rem;
		font-family: var(--font-mono);
		font-size: 0.75rem;
	}
	.comment header a {
		color: var(--fg);
	}
	.comment header time {
		color: var(--fg-muted);
		font-size: 0.7rem;
	}
	.comment p {
		margin: 0;
		font-size: 0.85rem;
		line-height: 1.45;
		color: #c8c8c8;
		white-space: pre-wrap;
	}
	.links {
		font-family: var(--font-mono);
		font-size: 0.8rem;
		margin: 2rem 0 0;
		padding-top: 1rem;
		border-top: 1px solid var(--border);
	}
</style>
