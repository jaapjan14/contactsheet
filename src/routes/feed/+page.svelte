<script lang="ts" module>
	import type { Snapshot } from './$types';
	import type { FlickrPhotoSummary } from '$lib/server/flickr/types';

	interface SnapState {
		photos: FlickrPhotoSummary[];
		currentPage: number;
		totalPages: number;
	}
	let snapHolder: SnapState | null = null;
	export const snapshot: Snapshot<SnapState | null> = {
		capture: () => snapHolder,
		restore: (v) => {
			snapHolder = v;
		}
	};
</script>

<script lang="ts">
	import { untrack } from 'svelte';
	import { photoUrl } from '$lib/flickr/urls';
	import { onCellClick } from '$lib/photo-overlay';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	// Restore from snapshot if SvelteKit had already populated snapHolder by
	// script-body time; otherwise fall back to the server-rendered initial
	// data. Trying to drain a late `snapshot.restore` via `afterNavigate`
	// turned out to be worse — re-applying scroll after the late expansion
	// teleported users to wrong positions when the captured Y didn't match
	// what the now-tall page actually had. Better-but-imperfect: live with
	// SvelteKit's native scroll restoration, which lands you near the top
	// of a deeply-scrolled grid on back-nav rather than at the wrong photo.
	const restored = untrack(() => snapHolder);

	let photos = $state<FlickrPhotoSummary[]>(
		untrack(() => restored?.photos ?? data.photos?.photo ?? [])
	);
	let currentPage = $state(untrack(() => restored?.currentPage ?? data.photos?.page ?? 1));
	let totalPages = $state(untrack(() => restored?.totalPages ?? data.photos?.pages ?? 1));
	let loading = $state(false);
	let sentinelEl: HTMLElement | null = $state(null);
	// Same dup-guard as /search — Flickr's date-posted-desc sort is mostly
	// stable but pages can briefly overlap. Three full dup pages = exhausted.
	let consecutiveDupOnlyPages = $state(0);

	function stashStream() {
		try {
			sessionStorage.setItem(
				'contactsheet:stream',
				JSON.stringify({
					ids: photos.map((p) => p.id),
					tab: 'feed',
					searchPath: '/feed'
				})
			);
		} catch {
			/* ignore */
		}
	}

	$effect(() => {
		snapHolder = { photos, currentPage, totalPages };
		if (photos.length > 0) stashStream();
	});

	async function loadMore() {
		if (loading || currentPage >= totalPages) return;
		loading = true;
		try {
			const next = currentPage + 1;
			const res = await fetch(`/api/feed?page=${next}`);
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			const pageData = (await res.json()) as {
				photo: FlickrPhotoSummary[];
				page: number;
				pages?: number;
				total?: number | string;
			};
			const incoming = pageData.photo ?? [];
			const seen = new Set(photos.map((p) => p.id));
			const newPhotos = incoming.filter((p) => !seen.has(p.id));
			photos = [...photos, ...newPhotos];
			currentPage = pageData.page ?? next;
			if (typeof pageData.pages === 'number') totalPages = pageData.pages;

			if (incoming.length === 0) {
				totalPages = currentPage;
				consecutiveDupOnlyPages = 0;
			} else if (newPhotos.length === 0) {
				consecutiveDupOnlyPages += 1;
				if (consecutiveDupOnlyPages >= 3) {
					totalPages = currentPage;
					consecutiveDupOnlyPages = 0;
				} else if (currentPage < totalPages) {
					loading = false;
					queueMicrotask(() => loadMore());
					return;
				}
			} else {
				consecutiveDupOnlyPages = 0;
			}
		} catch (err) {
			console.error('feed loadMore failed', err);
			totalPages = currentPage;
		} finally {
			loading = false;
		}
	}

	$effect(() => {
		if (!sentinelEl) return;
		const observer = new IntersectionObserver(
			(entries) => {
				if (entries[0].isIntersecting) loadMore();
			},
			{ rootMargin: '800px 0px' }
		);
		observer.observe(sentinelEl);
		return () => observer.disconnect();
	});

	function fmtUploadAge(epoch?: string): string {
		if (!epoch) return '';
		const ms = parseInt(epoch, 10) * 1000;
		if (!Number.isFinite(ms)) return '';
		const diff = Date.now() - ms;
		const mins = Math.floor(diff / 60_000);
		if (mins < 60) return `${mins}m ago`;
		const hours = Math.floor(mins / 60);
		if (hours < 24) return `${hours}h ago`;
		const days = Math.floor(hours / 24);
		if (days < 30) return `${days}d ago`;
		const months = Math.floor(days / 30);
		return `${months}mo ago`;
	}
</script>

<header class="feed-header">
	<h1>Feed</h1>
	<p class="blurb">
		Recent uploads from people you follow on Flickr, newest first. Scroll to
		load more — Flickr's search caps at roughly 4,000 results.
		{#if data.photos && data.photos.total !== undefined}
			<span class="total">· {Number(data.photos.total).toLocaleString()} matches available</span>
		{/if}
	</p>
</header>

{#if !data.signedIn}
	<section class="empty-card">
		<p>Sign in to Flickr to see uploads from your contacts.</p>
		<a href="/auth/start" class="btn primary">Sign in to Flickr</a>
	</section>
{:else if data.feedError}
	<p class="empty">Couldn't load your feed — {data.feedError}.</p>
{:else if photos.length === 0}
	<section class="empty-card">
		<p>Your contacts haven't posted recently — or you don't have any contacts yet.</p>
		<p class="muted">
			Add contacts on <a href="https://www.flickr.com/" target="_blank" rel="noopener">flickr.com</a>
			and they'll show up here.
		</p>
	</section>
{:else}
	<div class="grid">
		{#each photos as p (p.id)}
			<a
				class="cell"
				href="/photo/{p.id}"
				title={p.title}
				onclick={(e) => onCellClick(e, p.id)}
			>
				<img src={photoUrl(p, 'z')} alt={p.title} loading="lazy" />
				<span class="overlay">
					<span class="who">{p.ownername ?? ''}</span>
					{#if p.dateupload}
						<span class="age">{fmtUploadAge(p.dateupload)}</span>
					{/if}
				</span>
			</a>
		{/each}
	</div>

	{#if currentPage < totalPages}
		<div class="sentinel" bind:this={sentinelEl} aria-hidden="true">
			{#if loading}loading more…{/if}
		</div>
	{:else}
		<div class="end">end of feed · {photos.length.toLocaleString()} loaded</div>
	{/if}
{/if}

<style>
	.feed-header {
		max-width: 80rem;
		margin: 1.5rem auto 0;
		padding: 0 1.5rem;
	}
	.feed-header h1 {
		font-family: var(--font-sans);
		font-weight: 500;
		font-size: 1.5rem;
		letter-spacing: -0.01em;
		margin: 0 0 0.35rem;
	}
	.blurb {
		margin: 0 0 1rem;
		color: var(--fg-muted);
		font-family: var(--font-mono);
		font-size: 0.78rem;
		max-width: 100ch;
		line-height: 1.5;
	}
	.total {
		color: #c8c8c8;
	}
	.grid {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 2px;
		max-width: 80rem;
		margin: 0.75rem auto;
		padding: 0;
	}
	@media (min-width: 600px) {
		.grid {
			grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
			gap: 4px;
			margin: 1.5rem auto;
			padding: 0 1.5rem;
		}
	}
	.cell {
		position: relative;
		display: block;
		aspect-ratio: 1;
		overflow: hidden;
		background: var(--bg-elev);
		border-radius: 2px;
	}
	.cell img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		display: block;
		transition: transform 0.3s ease;
	}
	.cell:hover img {
		transform: scale(1.04);
	}
	.overlay {
		position: absolute;
		bottom: 0;
		left: 0;
		right: 0;
		display: flex;
		justify-content: space-between;
		gap: 0.5rem;
		padding: 0.4rem 0.5rem 0.45rem;
		background: linear-gradient(to top, rgba(0, 0, 0, 0.78), transparent);
		font-family: var(--font-mono);
		font-size: 0.68rem;
		color: #fff;
		opacity: 0;
		transition: opacity 0.15s;
	}
	.cell:hover .overlay {
		opacity: 1;
	}
	.who {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.age {
		flex-shrink: 0;
		color: rgba(255, 255, 255, 0.85);
	}
	.empty,
	.sentinel,
	.end {
		text-align: center;
		font-family: var(--font-mono);
		font-size: 0.78rem;
		color: var(--fg-muted);
		padding: 2rem 1.5rem 4rem;
		max-width: 80rem;
		margin: 0 auto;
	}
	.empty-card {
		max-width: 32rem;
		margin: 3rem auto;
		padding: 2rem 1.5rem;
		background: var(--bg-elev);
		border: 1px solid var(--border);
		border-radius: 6px;
		text-align: center;
		font-family: var(--font-mono);
		font-size: 0.85rem;
		color: var(--fg);
	}
	.empty-card p {
		margin: 0 0 1rem;
	}
	.empty-card p.muted {
		color: var(--fg-muted);
		font-size: 0.78rem;
		margin: 0;
	}
	.btn.primary {
		display: inline-block;
		background: var(--accent);
		color: #111;
		border: none;
		padding: 0.55rem 1.1rem;
		font-family: var(--font-mono);
		font-size: 0.85rem;
		font-weight: 500;
		border-radius: 3px;
		text-decoration: none;
	}
</style>
