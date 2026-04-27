<script lang="ts" module>
	import type { Snapshot } from './$types';
	import type { FlickrPhotoSummary } from '$lib/server/flickr/types';

	interface SnapState {
		date: string;
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
	import { page } from '$app/stores';
	import { photoUrl } from '$lib/flickr/urls';
	import { onCellClick } from '$lib/photo-overlay';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const stableDate = $derived(data.date ?? '_latest');

	const restored = untrack(() =>
		snapHolder?.date === stableDate ? snapHolder : null
	);

	let photos = $state<FlickrPhotoSummary[]>(
		untrack(() => restored?.photos ?? data.photos.photo)
	);
	let currentPage = $state(untrack(() => restored?.currentPage ?? data.photos.page));
	let totalPages = $state(untrack(() => restored?.totalPages ?? data.photos.pages));
	let loading = $state(false);
	let lastDate = $state(untrack(() => stableDate));
	let sentinelEl: HTMLElement | null = $state(null);

	function explorePath(): string {
		return `/explore${$page.url.search}`;
	}

	function stashStream(ids: string[]) {
		try {
			sessionStorage.setItem(
				'contactsheet:stream',
				JSON.stringify({ ids, explorePath: explorePath(), tab: 'explore' })
			);
		} catch {
			/* ignore */
		}
	}

	$effect(() => {
		if (stableDate !== lastDate) {
			lastDate = stableDate;
			photos = data.photos.photo;
			currentPage = data.photos.page;
			totalPages = data.photos.pages;
		}
		snapHolder = { date: stableDate, photos, currentPage, totalPages };
		if (photos.length > 0) stashStream(photos.map((p) => p.id));
	});

	async function loadMore() {
		if (loading || currentPage >= totalPages) return;
		loading = true;
		try {
			const next = currentPage + 1;
			const params = new URLSearchParams($page.url.search);
			params.set('page', String(next));
			const res = await fetch(`/api/explore/photos?${params.toString()}`);
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			const pageData = (await res.json()) as { photo: FlickrPhotoSummary[]; page: number };
			photos = [...photos, ...pageData.photo];
			currentPage = pageData.page;
			stashStream(photos.map((p) => p.id));
		} catch (err) {
			console.error('explore loadMore failed', err);
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
</script>

<section class="head">
	<h1>Explore</h1>
	<p class="meta">
		Flickr's daily picks — most-interesting photos
		{#if data.date}
			from <time>{data.date}</time>
		{:else}
			today
		{/if}
		.
	</p>
	<form method="get" action="/explore" class="datepicker">
		<label>
			Date:
			<input type="date" name="date" value={data.date ?? ''} />
		</label>
		<button type="submit">Go</button>
		{#if data.date}
			<a href="/explore" class="reset">Latest</a>
		{/if}
	</form>
</section>

<div class="grid">
	{#each photos as p (p.id)}
		<a
			class="cell"
			href="/photo/{p.id}"
			title={p.title}
			onclick={(e) => onCellClick(e, p.id)}
		>
			<img src={photoUrl(p, 'z')} alt={p.title} loading="lazy" />
		</a>
	{/each}
</div>

{#if currentPage < totalPages}
	<div class="sentinel" bind:this={sentinelEl} aria-hidden="true">
		{#if loading}loading more…{/if}
	</div>
{:else if photos.length > 0}
	<div class="end">end of explore · {photos.length.toLocaleString()} loaded</div>
{/if}

<style>
	.head {
		max-width: 80rem;
		margin: 1.5rem auto 0;
		padding: 0 1.5rem;
	}
	.head h1 {
		margin: 0;
		font-family: var(--font-sans);
		font-weight: 500;
		font-size: 1.5rem;
		letter-spacing: -0.01em;
	}
	.meta {
		margin: 0.25rem 0 0.75rem;
		color: var(--fg-muted);
		font-family: var(--font-mono);
		font-size: 0.78rem;
	}
	.meta time {
		color: #c8c8c8;
	}
	.datepicker {
		display: flex;
		gap: 0.5rem;
		align-items: center;
		font-family: var(--font-mono);
		font-size: 0.78rem;
		color: var(--fg-muted);
	}
	.datepicker input {
		background: var(--bg-elev);
		border: 1px solid var(--border);
		color: var(--fg);
		padding: 0.35rem 0.5rem;
		font-family: var(--font-mono);
		font-size: 0.8rem;
		border-radius: 3px;
		outline: none;
		color-scheme: dark;
	}
	.datepicker button {
		background: var(--accent);
		color: #111;
		border: none;
		padding: 0.4rem 0.85rem;
		font-family: var(--font-mono);
		font-size: 0.78rem;
		font-weight: 500;
		border-radius: 3px;
		cursor: pointer;
	}
	.datepicker .reset {
		font-size: 0.78rem;
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
	.sentinel,
	.end {
		text-align: center;
		font-family: var(--font-mono);
		font-size: 0.78rem;
		color: var(--fg-muted);
		padding: 2rem 0 4rem;
	}
</style>
