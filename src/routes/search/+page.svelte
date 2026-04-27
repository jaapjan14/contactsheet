<script lang="ts" module>
	import type { Snapshot } from './$types';
	import type { FlickrPhotoSummary, FlickrGroupSearchResult } from '$lib/server/flickr/types';

	interface SnapState {
		searchPath: string;
		photos: FlickrPhotoSummary[];
		currentPage: number;
		totalPages: number;
		total: number | string;
		groups: FlickrGroupSearchResult[] | null;
		groupsCollapsed: boolean;
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

	const restored = untrack(() =>
		snapHolder?.searchPath === $page.url.search ? snapHolder : null
	);

	let photos = $state<FlickrPhotoSummary[]>(
		untrack(() => restored?.photos ?? data.photos?.photo ?? [])
	);
	let currentPage = $state(
		untrack(() => restored?.currentPage ?? data.photos?.page ?? 1)
	);
	let totalPages = $state(
		untrack(() => restored?.totalPages ?? data.photos?.pages ?? 1)
	);
	let total = $state(untrack(() => restored?.total ?? data.photos?.total ?? 0));
	let groups = $state<FlickrGroupSearchResult[] | null>(
		untrack(() => restored?.groups ?? data.groups?.group ?? null)
	);
	let groupsCollapsed = $state(untrack(() => restored?.groupsCollapsed ?? false));
	let loading = $state(false);
	let lastSearchPath = $state<string>(untrack(() => $page.url.search));
	let sentinelEl: HTMLElement | null = $state(null);
	// Counts consecutive pages where Flickr returned photos but all of them
	// were already in the grid. After ~3 in a row we treat the result set as
	// exhausted (otherwise we'd recurse forever fetching dup-heavy pages).
	let consecutiveDupOnlyPages = $state(0);

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
			groups = data.groups?.group ?? null;
			groupsCollapsed = false;
		}
		snapHolder = {
			searchPath: $page.url.search,
			photos,
			currentPage,
			totalPages,
			total,
			groups,
			groupsCollapsed
		};
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
			const pageData = (await res.json()) as {
				photo: FlickrPhotoSummary[];
				page: number;
				pages?: number;
				total?: number | string;
			};
			const incoming = pageData.photo ?? [];
			// Flickr can return the same photo across pages (especially under
			// interestingness-desc, where the result set is non-stable). Dedup
			// against what we've already shown so Svelte's keyed
			// {#each photos as p (p.id)} doesn't throw each_key_duplicate.
			const seen = new Set(photos.map((p) => p.id));
			const newPhotos = incoming.filter((p) => !seen.has(p.id));
			photos = [...photos, ...newPhotos];
			currentPage = pageData.page ?? next;
			// Refresh pagination metadata from each response — the server-rendered
			// initial value can be stale or wrong, and we previously relied on it
			// forever, which is what caused load-more to lock out.
			if (typeof pageData.pages === 'number') totalPages = pageData.pages;
			if (pageData.total !== undefined) total = pageData.total;

			// Distinguish "Flickr cap reached" (empty raw response → stop) from
			// "all dups in this batch" (raw has photos but every one was already
			// in the grid → keep going, the sentinel won't re-fire on its own
			// because the grid didn't grow).
			if (incoming.length === 0) {
				// Flickr's photos.search caps at ~4000 results / page 40; past
				// that it returns stat:'ok' with an empty photo[].
				totalPages = currentPage;
				consecutiveDupOnlyPages = 0;
			} else if (newPhotos.length === 0) {
				consecutiveDupOnlyPages += 1;
				if (consecutiveDupOnlyPages >= 3) {
					// Three pages in a row with nothing new — treat as exhausted.
					totalPages = currentPage;
					consecutiveDupOnlyPages = 0;
				} else if (currentPage < totalPages) {
					// Auto-advance: clear loading, queue the next page on a
					// microtask so the UI gets a tick before we re-enter.
					loading = false;
					queueMicrotask(() => loadMore());
					return;
				}
			} else {
				consecutiveDupOnlyPages = 0;
			}
			stashStream(photos.map((p) => p.id));
		} catch (err) {
			console.error('search loadMore failed', err);
			// Stop pagination on hard error so the IntersectionObserver doesn't
			// keep retrying the same failing request as the user scrolls.
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
	<h1 class="page-title">Search</h1>
	<p class="page-blurb">
		Searches all of Flickr — returns matching <strong>photos</strong> and
		<strong>groups</strong> in one page. To search inside a single album, group,
		or user's photostream, open that page and use the search box there.
	</p>

	<form method="get" action="/search">
		<input
			class="qbox"
			name="q"
			type="search"
			placeholder="Text — title, description, tags…"
			value={data.query.q}
			autocomplete="off"
		/>
		<input
			class="ubox"
			name="user"
			type="search"
			placeholder="By user (URL or screen-name)"
			value={data.query.user}
			autocomplete="off"
		/>
		<input
			class="tbox"
			name="tags"
			type="search"
			placeholder="Tags only (comma-separated)"
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
	<p class="form-help">
		<strong>Text</strong> matches title, description, and tags.
		<strong>By&nbsp;user</strong> and <strong>Tags</strong> narrow the
		<em>photo</em> results only — group results always come from the text box.
	</p>

	{#if data.photos}
		<p class="meta">
			{Number(data.photos.total).toLocaleString()} photo results
			{#if data.query.user} · by <code>{data.query.user}</code>{/if}
			{#if data.query.tags} · tags: <code>{data.query.tags}</code>{/if}
			{#if data.groups && data.groups.group.length > 0}
				· {Number(data.groups.total).toLocaleString()} group{Number(data.groups.total) === 1 ? '' : 's'} matched
			{/if}
		</p>
	{/if}
</section>

{#if groups && groups.length > 0}
	<section class="groups-strip">
		<button
			type="button"
			class="groups-toggle"
			onclick={() => (groupsCollapsed = !groupsCollapsed)}
			aria-expanded={!groupsCollapsed}
		>
			<span class="chev" class:open={!groupsCollapsed}>▸</span>
			Groups · {groups.length}{data.groups && Number(data.groups.total) > groups.length
				? ` of ${Number(data.groups.total).toLocaleString()}`
				: ''}
		</button>
		{#if !groupsCollapsed}
			<div class="groups-list">
				{#each groups as g (g.nsid)}
					<a class="group-card" href="/group/{g.nsid}" title={g.name}>
						{#if g.iconserver && g.iconserver !== '0'}
							<img
								class="group-icon"
								src="https://farm{g.iconfarm}.staticflickr.com/{g.iconserver}/buddyicons/{g.nsid}.jpg"
								alt=""
								loading="lazy"
							/>
						{:else}
							<span class="group-icon placeholder" aria-hidden="true">G</span>
						{/if}
						<span class="group-meta">
							<span class="group-name">{g.name}</span>
							<span class="group-count">
								{#if g.members}{Number(g.members).toLocaleString()} members{/if}
								{#if g.members && g.pool_count} · {/if}
								{#if g.pool_count}{Number(g.pool_count).toLocaleString()} photos{/if}
							</span>
						</span>
					</a>
				{/each}
			</div>
		{/if}
	</section>
{/if}

{#if data.photos && photos.length > 0}
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
	.page-title {
		font-family: var(--font-sans);
		font-weight: 500;
		font-size: 1.5rem;
		letter-spacing: -0.01em;
		margin: 0 0 0.35rem;
	}
	.page-blurb {
		margin: 0 0 1rem;
		color: var(--fg-muted);
		font-family: var(--font-mono);
		font-size: 0.78rem;
		max-width: 100ch;
		line-height: 1.5;
	}
	.page-blurb strong {
		color: var(--fg);
		font-weight: 500;
	}
	.form-help {
		margin: 0.6rem 0 0;
		color: var(--fg-muted);
		font-family: var(--font-mono);
		font-size: 0.7rem;
		line-height: 1.5;
	}
	.form-help strong {
		color: #c8c8c8;
		font-weight: 500;
	}
	.form-help em {
		font-style: italic;
		color: #c8c8c8;
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
	.empty,
	.sentinel,
	.end {
		text-align: center;
		font-family: var(--font-mono);
		font-size: 0.78rem;
		color: var(--fg-muted);
		padding: 2rem 0 4rem;
	}
	.groups-strip {
		max-width: 80rem;
		margin: 1.25rem auto 0;
		padding: 0 1.5rem;
	}
	.groups-toggle {
		background: none;
		border: none;
		color: var(--fg-muted);
		font-family: var(--font-mono);
		font-size: 0.72rem;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		padding: 0.25rem 0;
		cursor: pointer;
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
	}
	.groups-toggle:hover {
		color: var(--fg);
	}
	.chev {
		display: inline-block;
		transition: transform 0.15s ease;
	}
	.chev.open {
		transform: rotate(90deg);
	}
	.groups-list {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
		gap: 0.5rem;
		margin-top: 0.6rem;
	}
	.group-card {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		padding: 0.5rem 0.7rem;
		background: var(--bg-elev);
		border: 1px solid var(--border);
		border-radius: 3px;
		text-decoration: none;
		color: inherit;
		min-width: 0;
		transition: border-color 0.15s ease;
	}
	.group-card:hover {
		border-color: var(--accent);
	}
	.group-icon {
		width: 36px;
		height: 36px;
		flex-shrink: 0;
		border-radius: 50%;
		object-fit: cover;
		background: #222;
	}
	.group-icon.placeholder {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		font-family: var(--font-mono);
		font-size: 0.8rem;
		color: var(--fg-muted);
	}
	.group-meta {
		display: flex;
		flex-direction: column;
		min-width: 0;
		gap: 0.1rem;
	}
	.group-name {
		font-family: var(--font-mono);
		font-size: 0.78rem;
		color: #c8c8c8;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.group-count {
		font-family: var(--font-mono);
		font-size: 0.65rem;
		color: var(--fg-muted);
	}
</style>
