<script lang="ts" module>
	import type { Snapshot } from './$types';
	import type { FlickrPhotoSummary } from '$lib/server/flickr/types';

	interface SnapState {
		userKey: string;
		query: string;
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
	import { tick, untrack } from 'svelte';
	import { goto } from '$app/navigation';
	import UserChrome from '$lib/components/UserChrome.svelte';
	import { photoUrl } from '$lib/flickr/urls';
	import { onCellClick } from '$lib/photo-overlay';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const restored = untrack(() =>
		snapHolder?.userKey === data.userKey && snapHolder?.query === data.query
			? snapHolder
			: null
	);

	let photos = $state<FlickrPhotoSummary[]>(
		untrack(() => restored?.photos ?? data.photos.photo)
	);
	let currentPage = $state(untrack(() => restored?.currentPage ?? data.photos.page));
	let totalPages = $state(untrack(() => restored?.totalPages ?? data.photos.pages));
	let loading = $state(false);
	let lastUserKey = $state(untrack(() => data.userKey));
	let lastQuery = $state(untrack(() => data.query));
	let sentinelEl: HTMLElement | null = $state(null);

	// Search-box UI state. Expanded whenever a search is active so the query
	// stays visible; otherwise starts collapsed to match the plain photostream.
	let searchExpanded = $state(untrack(() => data.query.length > 0));
	let searchInput = $state(untrack(() => data.query));
	let searchInputEl: HTMLInputElement | null = $state(null);

	function stashStream(ids: string[], userKey: string) {
		try {
			sessionStorage.setItem(
				'contactsheet:stream',
				JSON.stringify({ ids, userKey, tab: 'photostream' })
			);
		} catch {
			/* ignore */
		}
	}

	$effect(() => {
		if (data.userKey !== lastUserKey || data.query !== lastQuery) {
			lastUserKey = data.userKey;
			lastQuery = data.query;
			photos = data.photos.photo;
			currentPage = data.photos.page;
			totalPages = data.photos.pages;
			searchInput = data.query;
			searchExpanded = data.query.length > 0;
		}
		// Keep the snapshot holder current so capture has the latest state
		// without needing to recompute on nav-away.
		snapHolder = {
			userKey: data.userKey,
			query: data.query,
			photos,
			currentPage,
			totalPages
		};
		stashStream(
			photos.map((p) => p.id),
			data.userKey
		);
	});

	async function loadMore() {
		if (loading || currentPage >= totalPages) return;
		loading = true;
		try {
			const next = currentPage + 1;
			const url = data.query
				? `/api/search/photos?user=${encodeURIComponent(data.userKey)}&q=${encodeURIComponent(data.query)}&page=${next}`
				: `/api/user/${encodeURIComponent(data.userKey)}/photos?page=${next}`;
			const res = await fetch(url);
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			const pageData = (await res.json()) as { photo: FlickrPhotoSummary[]; page: number };
			photos = [...photos, ...pageData.photo];
			currentPage = pageData.page;
			stashStream(
				photos.map((p) => p.id),
				data.userKey
			);
		} catch (err) {
			console.error('loadMore failed', err);
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

	async function openSearch() {
		searchExpanded = true;
		await tick();
		searchInputEl?.focus();
	}

	function submitSearch(e: Event) {
		e.preventDefault();
		const q = searchInput.trim();
		goto(q ? `/user/${data.userKey}/photostream?q=${encodeURIComponent(q)}` : `/user/${data.userKey}/photostream`);
	}

	function clearSearch() {
		searchInput = '';
		searchExpanded = false;
		if (data.query) goto(`/user/${data.userKey}/photostream`);
	}
</script>

<UserChrome
	user={data.user}
	userKey={data.userKey}
	activeTab="photostream"
	subtitle={data.query ? 'Photostream' : `${data.photos.total.toLocaleString()} photos`}
	isSelf={data.me?.nsid === data.user.nsid}
/>

<div class="toolbar">
	{#if searchExpanded}
		<form class="search-form" onsubmit={submitSearch}>
			<input
				bind:this={searchInputEl}
				bind:value={searchInput}
				type="search"
				class="search-input"
				placeholder="Search {data.user.username._content}'s photos…"
				autocomplete="off"
			/>
			<button type="submit" class="icon-btn" aria-label="Search" title="Search">🔍</button>
			<button type="button" class="icon-btn" aria-label="Close search" title="Close" onclick={clearSearch}>✕</button>
		</form>
	{:else}
		<button type="button" class="icon-btn" aria-label="Search this photostream" title="Search" onclick={openSearch}>
			🔍
		</button>
	{/if}
</div>

{#if data.query}
	<p class="search-meta">
		{Number(data.photos.total).toLocaleString()} result{Number(data.photos.total) === 1 ? '' : 's'}
		for <code>{data.query}</code>
	</p>
{/if}

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

{#if data.query && photos.length === 0}
	<p class="empty">No photos match <code>{data.query}</code>.</p>
{:else if currentPage < totalPages}
	<div class="sentinel" bind:this={sentinelEl} aria-hidden="true">
		{#if loading}
			loading more…
		{/if}
	</div>
{:else if photos.length > 0}
	<div class="end">
		{data.query ? 'end of results' : 'end of stream'} · {photos.length.toLocaleString()} photos loaded
	</div>
{/if}

<style>
	.toolbar {
		display: flex;
		justify-content: flex-end;
		max-width: 80rem;
		margin: 0.75rem auto 0;
		padding: 0 1.5rem;
	}
	.icon-btn {
		background: var(--bg-elev);
		border: 1px solid var(--border);
		color: var(--fg-muted);
		width: 2.1rem;
		height: 2.1rem;
		border-radius: 3px;
		font-size: 0.9rem;
		line-height: 1;
		cursor: pointer;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
	}
	.icon-btn:hover {
		border-color: var(--accent);
		color: var(--fg);
	}
	.search-form {
		display: flex;
		gap: 0.4rem;
		width: 100%;
		max-width: 22rem;
	}
	.search-input {
		flex: 1;
		min-width: 0;
		background: var(--bg-elev);
		border: 1px solid var(--border);
		color: var(--fg);
		padding: 0 0.75rem;
		font-family: var(--font-mono);
		font-size: 0.85rem;
		border-radius: 3px;
		outline: none;
	}
	.search-input:focus {
		border-color: var(--accent);
	}
	.search-meta {
		max-width: 80rem;
		margin: 0.6rem auto 0;
		padding: 0 1.5rem;
		color: var(--fg-muted);
		font-family: var(--font-mono);
		font-size: 0.78rem;
	}
	.search-meta code {
		color: #c8c8c8;
	}
	.empty {
		text-align: center;
		font-family: var(--font-mono);
		font-size: 0.78rem;
		color: var(--fg-muted);
		padding: 2rem 0 4rem;
	}
	.empty code {
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
