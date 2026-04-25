<script lang="ts">
	import { untrack } from 'svelte';
	import UserChrome from '$lib/components/UserChrome.svelte';
	import { photoUrl } from '$lib/flickr/urls';
	import type { PageData } from './$types';
	import type { FlickrPhotoSummary } from '$lib/server/flickr/types';

	let { data }: { data: PageData } = $props();

	let photos = $state<FlickrPhotoSummary[]>(untrack(() => data.photos.photo));
	let currentPage = $state(untrack(() => data.photos.page));
	let totalPages = $state(untrack(() => data.photos.pages));
	let loading = $state(false);
	let lastGalleryId = $state(untrack(() => data.galleryId));
	let sentinelEl: HTMLElement | null = $state(null);

	function stashStream(ids: string[], galleryId: string) {
		try {
			sessionStorage.setItem(
				'contactsheet:stream',
				JSON.stringify({ ids, galleryId, tab: 'gallery' })
			);
		} catch {
			/* ignore */
		}
	}

	$effect(() => {
		if (data.galleryId !== lastGalleryId) {
			lastGalleryId = data.galleryId;
			photos = data.photos.photo;
			currentPage = data.photos.page;
			totalPages = data.photos.pages;
		}
		stashStream(
			photos.map((p) => p.id),
			data.galleryId
		);
	});

	async function loadMore() {
		if (loading || currentPage >= totalPages) return;
		loading = true;
		try {
			const next = currentPage + 1;
			const res = await fetch(
				`/api/gallery/${encodeURIComponent(data.galleryId)}/photos?page=${next}`
			);
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			const pageData = (await res.json()) as { photo: FlickrPhotoSummary[]; page: number };
			photos = [...photos, ...pageData.photo];
			currentPage = pageData.page;
			stashStream(
				photos.map((p) => p.id),
				data.galleryId
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

<UserChrome
	user={data.user}
	userKey={data.userKey}
	activeTab="galleries"
	subtitle="{data.user.photos?.count._content ?? '?'} photos"
	isSelf={data.me?.nsid === data.user.nsid}
/>

<section class="gallery-header">
	<h2>{data.gallery.title._content || 'Untitled gallery'}</h2>
	<p class="meta">
		{Number(data.gallery.count_photos).toLocaleString()} photos ·
		<a href="/user/{data.userKey}/galleries">all galleries</a>
	</p>
	{#if data.gallery.description._content?.trim()}
		<p class="desc">{data.gallery.description._content.trim()}</p>
	{/if}
</section>

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
	<div class="end">end of gallery · {photos.length.toLocaleString()} photos</div>
{/if}

<style>
	.gallery-header {
		max-width: 80rem;
		margin: 1.5rem auto 0;
		padding: 0 1.5rem;
	}
	.gallery-header h2 {
		margin: 0;
		font-family: var(--font-sans);
		font-weight: 500;
		font-size: 1.25rem;
		letter-spacing: -0.01em;
	}
	.gallery-header .meta {
		margin: 0.25rem 0 0;
		color: var(--fg-muted);
		font-family: var(--font-mono);
		font-size: 0.78rem;
	}
	.gallery-header .desc {
		margin: 0.75rem 0 0;
		color: #c8c8c8;
		font-size: 0.9rem;
		line-height: 1.5;
		max-width: 48rem;
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
