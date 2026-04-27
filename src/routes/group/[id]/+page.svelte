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
	import { untrack, onMount } from 'svelte';
	import { photoUrl } from '$lib/flickr/urls';
	import { onCellClick } from '$lib/photo-overlay';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	// Membership state — lazy-loaded via /api/group/[id]/membership so the
	// SSR'd group page doesn't pay a people.getGroups round-trip on every
	// public hit. Only the authed-self gets the join/leave button.
	type MembershipState = { signedIn: boolean; member: boolean };
	let membership = $state<MembershipState | null>(null);
	let membershipPending = $state(false);
	let membershipError: string | null = $state(null);

	async function fetchMembership() {
		try {
			const res = await fetch(
				`/api/group/${encodeURIComponent(data.groupKey)}/membership`
			);
			if (!res.ok) return;
			membership = (await res.json()) as MembershipState;
		} catch {
			/* silent — button stays hidden if we can't determine */
		}
	}

	onMount(fetchMembership);

	let lastMembershipKey = untrack(() => data.groupKey);
	$effect(() => {
		if (data.groupKey === lastMembershipKey) return;
		lastMembershipKey = data.groupKey;
		membership = null;
		membershipError = null;
		fetchMembership();
	});

	async function toggleMembership() {
		if (!membership || membershipPending) return;
		const wantJoin = !membership.member;
		membershipPending = true;
		membershipError = null;
		// Optimistic flip so the button visibly responds; rollback on failure.
		membership = { ...membership, member: wantJoin };
		try {
			const res = await fetch(
				`/api/group/${encodeURIComponent(data.groupKey)}/membership`,
				{ method: wantJoin ? 'POST' : 'DELETE' }
			);
			if (!res.ok) {
				const text = await res.text();
				throw new Error(text || `HTTP ${res.status}`);
			}
			const result = (await res.json()) as { member: boolean };
			membership = { signedIn: true, member: result.member };
		} catch (err) {
			membership = { ...membership, member: !wantJoin };
			membershipError = (err as Error).message;
		} finally {
			membershipPending = false;
		}
	}

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

<header class="group-header">
	<img class="icon" src={groupIcon} alt="" />
	<div class="who">
		<h1>{data.group.name._content}</h1>
		<p class="meta">
			{Number(data.group.members?._content ?? 0).toLocaleString()} members ·
			{Number(data.group.pool_count?._content ?? data.photos.total).toLocaleString()} photos in pool
		</p>
		{#if membershipError}<p class="membership-error">{membershipError}</p>{/if}
	</div>
	{#if membership && membership.signedIn}
		<button
			type="button"
			class="member-btn"
			class:joined={membership.member}
			onclick={toggleMembership}
			disabled={membershipPending}
			title={membership.member ? 'Leave this group' : 'Join this group'}
		>
			{#if membershipPending}
				…
			{:else if membership.member}
				✓ Joined
			{:else}
				+ Join group
			{/if}
		</button>
	{/if}
	<form class="group-search" method="get" action="/group/{data.groupKey}" role="search">
		<input
			name="q"
			type="search"
			placeholder="Search this group…"
			bind:value={searchDraft}
			autocomplete="off"
			aria-label="Search this group"
		/>
		{#if data.query}
			<a class="clear" href="/group/{data.groupKey}" title="Clear search">×</a>
		{/if}
	</form>
</header>

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
	.member-btn {
		margin-left: auto;
		font-family: var(--font-mono);
		font-size: 0.78rem;
		padding: 0.45rem 0.9rem;
		border-radius: 3px;
		background: var(--bg-elev);
		color: var(--accent);
		border: 1px solid var(--border);
		cursor: pointer;
		white-space: nowrap;
		transition: border-color 0.15s, color 0.15s;
	}
	/* When no membership button exists (anonymous viewer), let the search box
	   take the auto-margin instead so it stays right-aligned. */
	.who + .group-search {
		margin-left: auto;
	}
	.member-btn:hover:not(:disabled) {
		border-color: var(--accent);
	}
	.member-btn:disabled {
		opacity: 0.6;
		cursor: progress;
	}
	.member-btn.joined {
		color: #6cd58a;
		border-color: #2c5a3a;
		background: rgba(108, 213, 138, 0.06);
	}
	.member-btn.joined:hover:not(:disabled) {
		border-color: #6cd58a;
	}
	.membership-error {
		margin: 0.25rem 0 0;
		color: #ff6b6b;
		font-family: var(--font-mono);
		font-size: 0.72rem;
	}
	.group-search {
		display: flex;
		align-items: center;
		gap: 0.4rem;
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
	.search-meta code {
		color: #c8c8c8;
	}
	.empty code {
		color: #c8c8c8;
	}
	@media (max-width: 600px) {
		.group-search {
			margin-left: 0;
			flex-basis: 100%;
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
