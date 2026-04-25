<script lang="ts">
	import { untrack } from 'svelte';
	import { page } from '$app/stores';
	import { photoUrl } from '$lib/flickr/urls';
	import type { PageData } from './$types';
	import type { FlickrPhotoSummary } from '$lib/server/flickr/types';

	let { data }: { data: PageData } = $props();

	let photos = $state<FlickrPhotoSummary[]>(untrack(() => data.photos?.photo ?? []));
	let currentPage = $state(untrack(() => data.photos?.page ?? 1));
	let totalPages = $state(untrack(() => data.photos?.pages ?? 1));
	let total = $state(untrack(() => data.photos?.total ?? 0));
	let loading = $state(false);
	let lastSearchPath = $state(untrack(() => $page.url.search));
	let sentinelEl: HTMLElement | null = $state(null);

	function searchPath(): string {
		return `/search${$page.url.search}`;
	}

	function stashStream(ids: string[]) {
		try {
			sessionStorage.setItem(
				'contactsheet:stream',
				JSON.stringify({ ids, searchPath: searchPath(), tab: 'search' })
			);
		} catch {
			/* ignore */
		}
	}

	$effect(() => {
		if ($page.url.search !== lastSearchPath) {
			lastSearchPath = $page.url.search;
			photos = data.photos?.photo ?? [];
			currentPage = data.photos?.page ?? 1;
			totalPages = data.photos?.pages ?? 1;
			total = data.photos?.total ?? 0;
		}
		if (photos.length > 0) {
			stashStream(photos.map((p) => p.id));
		}
	});

	async function loadMore() {
		if (loading || currentPage >= totalPages) return;
		loading = true;
		try {
			const next = currentPage + 1;
			const params = new URLSearchParams($page.url.search);
			params.set('page', String(next));
			const res = await fetch(`/api/search/photos?${params.toString()}`);
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			const pageData = (await res.json()) as { photo: FlickrPhotoSummary[]; page: number };
			photos = [...photos, ...pageData.photo];
			currentPage = pageData.page;
			stashStream(photos.map((p) => p.id));
		} catch (err) {
			console.error('search loadMore failed', err);
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

	const sortLabels: Record<string, string> = {
		relevance: 'Relevance',
		'date-posted-desc': 'Newest',
		'date-posted-asc': 'Oldest',
		'date-taken-desc': 'Recently taken',
		'date-taken-asc': 'Earliest taken',
		'interestingness-desc': 'Most interesting',
		'interestingness-asc': 'Least interesting'
	};

	function buildQuery(overrides: Record<string, string>): string {
		const params = new URLSearchParams($page.url.search);
		for (const [k, v] of Object.entries(overrides)) {
			if (v) params.set(k, v);
			else params.delete(k);
		}
		return `?${params.toString()}`;
	}
</script>

<section class="search-header">
	<form method="get" action="/search">
		<input
			class="qbox"
			name="q"
			type="search"
			placeholder="Search Flickr…"
			value={data.query.q}
			autocomplete="off"
		/>
		<input
			class="ubox"
			name="user"
			type="search"
			placeholder="user (optional)"
			value={data.query.user}
			autocomplete="off"
		/>
		<input
			class="tbox"
			name="tags"
			type="search"
			placeholder="tags, comma-separated"
			value={data.query.tags}
			autocomplete="off"
		/>
		<select name="sort" value={data.query.sort}>
			{#each Object.entries(sortLabels) as [val, label] (val)}
				<option value={val}>{label}</option>
			{/each}
		</select>
		<button type="submit">Search</button>
	</form>

	{#if data.photos}
		<p class="meta">
			{Number(data.photos.total).toLocaleString()} results
			{#if data.query.user} · in <code>{data.query.user}</code>{/if}
			{#if data.query.tags} · tags: <code>{data.query.tags}</code>{/if}
		</p>
	{:else}
		<p class="meta">
			Search Flickr by text, user, tags, or any combination. Results work like the rest of
			ContactSheet — click a thumbnail, page with arrows, close to come back here.
		</p>
	{/if}
</section>

{#if data.photos && photos.length > 0}
	<div class="grid">
		{#each photos as p (p.id)}
			<a class="cell" href="/photo/{p.id}" title={p.title}>
				<img
					src={photoUrl(p, 'z')}
					alt={p.title}
					loading="lazy"
					style="view-transition-name: photo-{p.id};"
				/>
			</a>
		{/each}
	</div>

	{#if currentPage < totalPages}
		<div class="sentinel" bind:this={sentinelEl} aria-hidden="true">
			{#if loading}loading more…{/if}
		</div>
	{:else}
		<div class="end">end of results · {photos.length.toLocaleString()} loaded</div>
	{/if}
{:else if data.photos}
	<p class="empty">No photos match.</p>
{/if}

<style>
	.search-header {
		max-width: 80rem;
		margin: 1.5rem auto;
		padding: 0 1.5rem;
	}
	form {
		display: grid;
		grid-template-columns: 2fr 1fr 1.5fr 1.2fr auto;
		gap: 0.5rem;
	}
	@media (max-width: 800px) {
		form {
			grid-template-columns: 1fr;
		}
	}
	form input,
	form select {
		background: var(--bg-elev);
		border: 1px solid var(--border);
		color: var(--fg);
		padding: 0.55rem 0.75rem;
		font-family: var(--font-mono);
		font-size: 0.85rem;
		border-radius: 3px;
		outline: none;
		min-width: 0;
	}
	form input:focus,
	form select:focus {
		border-color: var(--accent);
	}
	form button {
		background: var(--accent);
		color: #111;
		border: none;
		padding: 0.55rem 1rem;
		font-family: var(--font-mono);
		font-size: 0.85rem;
		font-weight: 500;
		border-radius: 3px;
		cursor: pointer;
	}
	.meta {
		margin: 0.75rem 0 0;
		color: var(--fg-muted);
		font-family: var(--font-mono);
		font-size: 0.78rem;
	}
	.meta code {
		color: #c8c8c8;
	}
	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
		gap: 4px;
		max-width: 80rem;
		margin: 1.5rem auto;
		padding: 0 1.5rem;
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
	.empty,
	.sentinel,
	.end {
		text-align: center;
		font-family: var(--font-mono);
		font-size: 0.78rem;
		color: var(--fg-muted);
		padding: 2rem 0 4rem;
	}
</style>
