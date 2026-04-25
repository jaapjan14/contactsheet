<script lang="ts" module>
	import type { Snapshot } from './$types';
	import type { FlickrPhotoSummary } from '$lib/server/flickr/types';

	interface SnapState {
		groupKey: string;
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
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const restored = untrack(() =>
		snapHolder?.groupKey === data.groupKey ? snapHolder : null
	);

	let photos = $state<FlickrPhotoSummary[]>(
		untrack(() => restored?.photos ?? data.photos.photo)
	);
	let currentPage = $state(untrack(() => restored?.currentPage ?? data.photos.page));
	let totalPages = $state(untrack(() => restored?.totalPages ?? data.photos.pages));
	let loading = $state(false);
	let lastGroupKey = $state(untrack(() => data.groupKey));
	let sentinelEl: HTMLElement | null = $state(null);

	const groupIcon = $derived.by(() => {
		const g = data.group;
		if (!g.iconserver || g.iconserver === '0') {
			return 'https://www.flickr.com/images/buddyicon.gif';
		}
		return `https://farm${g.iconfarm}.staticflickr.com/${g.iconserver}/buddyicons/${g.id}.jpg`;
	});

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
		if (data.groupKey !== lastGroupKey) {
			lastGroupKey = data.groupKey;
			photos = data.photos.photo;
			currentPage = data.photos.page;
			totalPages = data.photos.pages;
		}
		snapHolder = { groupKey: data.groupKey, photos, currentPage, totalPages };
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
			const res = await fetch(
				`/api/group/${encodeURIComponent(data.groupKey)}/photos?page=${next}`
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

<header class="group-header">
	<img class="icon" src={groupIcon} alt="" />
	<div class="who">
		<h1>{data.group.name._content}</h1>
		<p class="meta">
			{Number(data.group.members?._content ?? 0).toLocaleString()} members ·
			{Number(data.group.pool_count?._content ?? data.photos.total).toLocaleString()} photos in pool
		</p>
	</div>
</header>

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
{:else if photos.length > 0}
	<div class="end">end of pool · {photos.length.toLocaleString()} photos loaded</div>
{/if}

<style>
	.topnav {
		max-width: 80rem;
		margin: 1.5rem auto 0;
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
	.group-header {
		display: flex;
		align-items: center;
		gap: 1rem;
		max-width: 80rem;
		margin: 1rem auto 1rem;
		padding: 0 1.5rem;
		border-bottom: 1px solid var(--border);
		padding-bottom: 1rem;
	}
	.icon {
		width: 64px;
		height: 64px;
		border-radius: 4px;
		background: var(--bg-elev);
	}
	.who h1 {
		margin: 0;
		font-family: var(--font-sans);
		font-weight: 500;
		font-size: 1.5rem;
		letter-spacing: -0.01em;
	}
	.meta {
		margin: 0.25rem 0 0;
		color: var(--fg-muted);
		font-family: var(--font-mono);
		font-size: 0.8rem;
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
	.sentinel,
	.end {
		text-align: center;
		font-family: var(--font-mono);
		font-size: 0.78rem;
		color: var(--fg-muted);
		padding: 2rem 0 4rem;
	}
</style>
