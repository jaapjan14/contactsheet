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
	import { onCellClick } from '$lib/photo-overlay';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const restored = untrack(() =>
		snapHolder?.userKey === data.userKey ? snapHolder : null
	);

	let photos = $state<FlickrPhotoSummary[]>(
		untrack(() => restored?.photos ?? data.photos.photo)
	);
	let currentPage = $state(untrack(() => restored?.currentPage ?? data.photos.page));
	let totalPages = $state(untrack(() => restored?.totalPages ?? data.photos.pages));
	let loading = $state(false);
	let lastUserKey = $state(untrack(() => data.userKey));
	let sentinelEl: HTMLElement | null = $state(null);

	function monthKey(p: FlickrPhotoSummary): string {
		const taken = p.datetaken ?? '';
		// "2026-01-15 14:30:22" → "2026-01"; fallback bucket "Undated"
		const m = taken.match(/^(\d{4})-(\d{2})/);
		return m ? `${m[1]}-${m[2]}` : 'Undated';
	}

	const grouped = $derived.by(() => {
		const g = new Map<string, FlickrPhotoSummary[]>();
		for (const p of photos) {
			const key = monthKey(p);
			const list = g.get(key);
			if (list) list.push(p);
			else g.set(key, [p]);
		}
		// Map preserves insertion order; photos are already date-desc from Flickr,
		// so the buckets come out in the right order.
		return Array.from(g.entries());
	});

	function formatMonth(key: string): string {
		if (key === 'Undated') return 'Undated';
		const [y, m] = key.split('-');
		const d = new Date(Number(y), Number(m) - 1, 1);
		return d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
	}

	function stashStream(ids: string[], userKey: string) {
		try {
			sessionStorage.setItem(
				'contactsheet:stream',
				JSON.stringify({ ids, userKey, tab: 'camera-roll' })
			);
		} catch {
			/* ignore */
		}
	}

	$effect(() => {
		if (data.userKey !== lastUserKey) {
			lastUserKey = data.userKey;
			photos = data.photos.photo;
			currentPage = data.photos.page;
			totalPages = data.photos.pages;
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
				`/api/user/${encodeURIComponent(data.userKey)}/photos?page=${next}`
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
	activeTab="camera-roll"
	subtitle="{Number(data.photos.total).toLocaleString()} photos"
	isSelf={data.me?.nsid === data.user.nsid}
/>

<div class="roll">
	{#each grouped as [key, monthPhotos] (key)}
		<section class="month">
			<h2>{formatMonth(key)} <span class="count">{monthPhotos.length}</span></h2>
			<div class="grid">
				{#each monthPhotos as p (p.id)}
					<a
					class="cell"
					href="/photo/{p.id}"
					title={p.title}
					onclick={(e) => onCellClick(e, p.id)}
				>
						<img
							src={photoUrl(p, 'z')}
							alt={p.title}
							loading="lazy"
							style="view-transition-name: photo-{p.id};"
						/>
					</a>
				{/each}
			</div>
		</section>
	{/each}
</div>

{#if currentPage < totalPages}
	<div class="sentinel" bind:this={sentinelEl} aria-hidden="true">
		{#if loading}loading more…{/if}
	</div>
{:else if photos.length > 0}
	<div class="end">end of roll · {photos.length.toLocaleString()} photos</div>
{/if}

<style>
	.roll {
		max-width: 80rem;
		margin: 1.5rem auto 0;
		padding: 0 1.5rem;
	}
	.month {
		margin-bottom: 2rem;
	}
	.month h2 {
		font-family: var(--font-mono);
		font-size: 0.78rem;
		font-weight: 500;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--fg-muted);
		margin: 0 0 0.6rem;
		padding-bottom: 0.4rem;
		border-bottom: 1px solid var(--border);
		display: flex;
		align-items: baseline;
		gap: 0.6rem;
	}
	.count {
		color: #555;
		font-size: 0.7rem;
		letter-spacing: 0.06em;
	}
	.grid {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 2px;
	}
	@media (min-width: 600px) {
		.grid {
			grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
			gap: 4px;
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
