<script lang="ts" module>
	import type { Snapshot } from './$types';
	import type { FlickrPhotoSummary } from '$lib/server/flickr/types';

	interface SnapState {
		groupKey: string;
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
	import { untrack } from 'svelte';
	import { photoUrl } from '$lib/flickr/urls';
	import { onCellClick } from '$lib/photo-overlay';
	import GroupChrome from '$lib/components/GroupChrome.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const restored = untrack(() =>
		snapHolder?.groupKey === data.groupKey && snapHolder?.query === data.query
			? snapHolder
			: null
	);

	let photos = $state<FlickrPhotoSummary[]>(
		untrack(() => restored?.photos ?? data.photos.photo)
	);
	let currentPage = $state(untrack(() => restored?.currentPage ?? data.photos.page));
	let totalPages = $state(untrack(() => restored?.totalPages ?? data.photos.pages));
	let loading = $state(false);
	let lastGroupKey = $state(untrack(() => data.groupKey));
	let lastQuery = $state(untrack(() => data.query));
	// Local copy of the search input — we let the user type, then the form
	// submits to /group/[id]?q=… and the server reloads in search mode.
	let searchDraft = $state(untrack(() => data.query));
	let sentinelEl: HTMLElement | null = $state(null);

	function back() {
		if (typeof window === 'undefined') return;
		const sameOrigin =
			document.referrer && new URL(document.referrer).origin === window.location.origin;
		if (sameOrigin && window.history.length > 1) window.history.back();
		else window.location.href = '/';
	}

	function stashStream(ids: string[], groupId: string) {
		try {
			sessionStorage.setItem(
				'contactsheet:stream',
				JSON.stringify({ ids, groupId, tab: 'group' })
			);
		} catch {
			/* ignore */
		}
	}

	$effect(() => {
		if (data.groupKey !== lastGroupKey || data.query !== lastQuery) {
			lastGroupKey = data.groupKey;
			lastQuery = data.query;
			photos = data.photos.photo;
			currentPage = data.photos.page;
			totalPages = data.photos.pages;
			searchDraft = data.query;
		}
		snapHolder = {
			groupKey: data.groupKey,
			query: data.query,
			photos,
			currentPage,
			totalPages
		};
		stashStream(
			photos.map((p) => p.id),
			data.groupKey
		);
	});

	async function loadMore() {
		if (loading || currentPage >= totalPages) return;
		loading = true;
		try {
			const next = currentPage + 1;
			const params = new URLSearchParams({ page: String(next) });
			if (data.query) params.set('q', data.query);
			const res = await fetch(
				`/api/group/${encodeURIComponent(data.groupKey)}/photos?${params.toString()}`
			);
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			const pageData = (await res.json()) as { photo: FlickrPhotoSummary[]; page: number };
			photos = [...photos, ...pageData.photo];
			currentPage = pageData.page;
			stashStream(
				photos.map((p) => p.id),
				data.groupKey
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
</script>

<nav class="topnav">
	<button type="button" class="back" onclick={back}>← Back</button>
</nav>

<GroupChrome
	group={data.group}
	groupKey={data.groupKey}
	activeTab="photos"
	poolCount={Number(data.group.pool_count?._content ?? data.photos.total)}
/>

<form class="group-search" method="get" action="/group/{data.groupKey}" role="search">
	<input
		name="q"
		type="search"
		placeholder="Search photos in this group…"
		bind:value={searchDraft}
		autocomplete="off"
		aria-label="Search this group"
	/>
	{#if data.query}
		<a class="clear" href="/group/{data.groupKey}" title="Clear search">×</a>
	{/if}
</form>

{#if data.poolError}
	<p class="empty">
		Can't view this group's pool — {data.poolError}.
	</p>
{:else}
	{#if data.query}
		<p class="search-meta">
			{Number(data.photos.total).toLocaleString()} matches for
			<code>{data.query}</code> in this group ·
			<a href="/group/{data.groupKey}">show all</a>
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

	{#if currentPage < totalPages}
		<div class="sentinel" bind:this={sentinelEl} aria-hidden="true">
			{#if loading}loading more…{/if}
		</div>
	{:else if photos.length > 0}
		<div class="end">
			{data.query
				? `end of matches · ${photos.length.toLocaleString()} loaded`
				: `end of pool · ${photos.length.toLocaleString()} photos loaded`}
		</div>
	{:else if data.query}
		<p class="empty">No photos in this group match <code>{data.query}</code>.</p>
	{/if}
{/if}

<style>
	.topnav {
		max-width: 80rem;
		margin: 1rem auto 0;
		padding: 0 1.5rem;
	}
	.back {
		background: var(--bg-elev);
		border: 1px solid var(--border);
		color: var(--fg);
		font-family: var(--font-mono);
		font-size: 0.78rem;
		padding: 0.4rem 0.85rem;
		border-radius: 3px;
		cursor: pointer;
	}
	.back:hover {
		border-color: var(--accent);
		color: var(--accent);
	}
	.group-search {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		max-width: 80rem;
		margin: 0.85rem auto 0;
		padding: 0 1.5rem;
		min-width: 0;
	}
	.group-search input {
		background: var(--bg-elev);
		border: 1px solid var(--border);
		color: var(--fg);
		padding: 0.45rem 0.7rem;
		font-family: var(--font-mono);
		font-size: 0.8rem;
		border-radius: 3px;
		outline: none;
		min-width: 14rem;
	}
	.group-search input:focus {
		border-color: var(--accent);
	}
	.clear {
		font-family: var(--font-mono);
		font-size: 1rem;
		line-height: 1;
		color: var(--fg-muted);
		padding: 0.2rem 0.45rem;
		border: 1px solid var(--border);
		border-radius: 3px;
	}
	.clear:hover {
		color: var(--accent);
		text-decoration: none;
	}
	.search-meta {
		max-width: 80rem;
		margin: 0.5rem auto 0;
		padding: 0 1.5rem;
		color: var(--fg-muted);
		font-family: var(--font-mono);
		font-size: 0.78rem;
	}
	.search-meta code,
	.empty code {
		color: #c8c8c8;
	}
	@media (max-width: 600px) {
		.group-search {
			padding: 0 1rem;
		}
		.group-search input {
			flex: 1;
			min-width: 0;
		}
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
	.end,
	.empty {
		text-align: center;
		font-family: var(--font-mono);
		font-size: 0.85rem;
		color: var(--fg-muted);
		padding: 2rem 1.5rem 4rem;
		max-width: 80rem;
		margin: 0 auto;
	}
	.empty {
		font-size: 0.9rem;
	}
</style>
