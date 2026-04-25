<script lang="ts" module>
	import type { Snapshot } from './$types';
	import type { FlickrPhotoSummary } from '$lib/server/flickr/types';

	interface SnapState {
		userKey: string;
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
	import UserChrome from '$lib/components/UserChrome.svelte';
	import { photoUrl } from '$lib/flickr/urls';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const restored = untrack(() =>
		snapHolder?.userKey === data.userKey ? snapHolder : null
	);

	let photos = $state<FlickrPhotoSummary[]>(
		untrack(() => restored?.photos ?? data.faves.photo)
	);
	let currentPage = $state(untrack(() => restored?.currentPage ?? data.faves.page));
	let totalPages = $state(untrack(() => restored?.totalPages ?? data.faves.pages));
	let loading = $state(false);
	let lastUserKey = $state(untrack(() => data.userKey));
	let sentinelEl: HTMLElement | null = $state(null);

	function stashStream(ids: string[], userKey: string) {
		try {
			sessionStorage.setItem(
				'contactsheet:stream',
				JSON.stringify({ ids, userKey, tab: 'faves' })
			);
		} catch {
			/* ignore */
		}
	}

	$effect(() => {
		if (data.userKey !== lastUserKey) {
			lastUserKey = data.userKey;
			photos = data.faves.photo;
			currentPage = data.faves.page;
			totalPages = data.faves.pages;
		}
		snapHolder = { userKey: data.userKey, photos, currentPage, totalPages };
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
			const res = await fetch(
				`/api/user/${encodeURIComponent(data.userKey)}/faves?page=${next}`
			);
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
</script>

<UserChrome
	user={data.user}
	userKey={data.userKey}
	activeTab="faves"
	subtitle="{Number(data.faves.total).toLocaleString()} faves"
	isSelf={data.me?.nsid === data.user.nsid}
/>

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

{#if photos.length === 0}
	<p class="empty">No public faves.</p>
{:else if currentPage < totalPages}
	<div class="sentinel" bind:this={sentinelEl} aria-hidden="true">
		{#if loading}loading more…{/if}
	</div>
{:else}
	<div class="end">end of faves · {photos.length.toLocaleString()} loaded</div>
{/if}

<style>
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
