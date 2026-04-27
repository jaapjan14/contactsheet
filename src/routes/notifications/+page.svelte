<script lang="ts">
	import { untrack } from 'svelte';
	import { onCellClick } from '$lib/photo-overlay';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	// Local override of the server-loaded list so optimistic mark-seen and
	// "Check now" can mutate without a full page refresh. Initialised from
	// data.items on first render and then owned by the page — `untrack`
	// silences svelte-check's "did you mean a derived?" hint, since the
	// whole point is that we DON'T want this to re-derive from data.items.
	let items = $state(untrack(() => [...data.items]));
	let polling = $state(false);

	function thumbUrl(p: { photoSecret?: string; photoServer?: string; photoId?: string }) {
		if (!p.photoSecret || !p.photoServer || !p.photoId) return null;
		return `https://live.staticflickr.com/${p.photoServer}/${p.photoId}_${p.photoSecret}_q.jpg`;
	}

	function formatRelative(unixSecs: number) {
		const ms = Date.now() - unixSecs * 1000;
		const s = Math.floor(ms / 1000);
		if (s < 60) return `${s}s ago`;
		const m = Math.floor(s / 60);
		if (m < 60) return `${m}m ago`;
		const h = Math.floor(m / 60);
		if (h < 24) return `${h}h ago`;
		const d = Math.floor(h / 24);
		return `${d}d ago`;
	}

	function userHref(p: Record<string, unknown>): string | null {
		const id = (p.user as string | undefined) || (p.username as string | undefined);
		return id ? `/user/${id}/photostream` : null;
	}

	async function markAllSeen() {
		await fetch('/api/notifications/mark-seen', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ all: true })
		});
		items = items.map((i) => ({ ...i, seen_at: i.seen_at ?? Date.now() }));
	}

	async function pollNow() {
		polling = true;
		try {
			await fetch('/api/notifications/poll', { method: 'POST' });
			const res = await fetch('/api/notifications?limit=200');
			if (res.ok) {
				const data = (await res.json()) as { items: typeof items };
				items = data.items;
			}
		} finally {
			polling = false;
		}
	}
</script>

<svelte:head>
	<title>Notifications · ContactSheet</title>
</svelte:head>

<section class="page">
	<header class="page-header">
		<h1>Notifications</h1>
		<div class="actions">
			<button type="button" class="btn" onclick={pollNow} disabled={polling}>
				{polling ? 'Checking…' : 'Check now'}
			</button>
			<button type="button" class="btn" onclick={markAllSeen}>Mark all read</button>
		</div>
	</header>

	{#if items.length === 0}
		<p class="empty">
			Nothing yet. The poller checks every 15 minutes for new favorites, comments, and Explore
			hits.
		</p>
	{:else}
		<ul class="feed">
			{#each items as item (item.id)}
				{@const p = item.payload as Record<string, unknown>}
				{@const photoId = p.photoId as string | undefined}
				{@const photoTitle = (p.photoTitle as string) || 'Untitled'}
				{@const username = (p.username as string) || 'Someone'}
				{@const uHref = userHref(p)}
				<li class:unseen={item.seen_at === null}>
					<div class="card">
						<a
							class="thumb-anchor"
							href="/photo/{photoId}"
							aria-label="Open photo"
							onclick={(e) => onCellClick(e, photoId as string)}
						>
							{#if thumbUrl(p)}
								<img class="thumb" src={thumbUrl(p)} alt="" />
							{:else}
								<div class="thumb thumb-placeholder"></div>
							{/if}
						</a>
						<div class="text">
							<div class="type-tag type-{item.type}">{item.type}</div>
							<div class="summary">
								{#if item.type === 'favorite'}
									{#if uHref}
										<a class="user-link" href={uHref}>{username}</a>
									{:else}{username}{/if}
									faved
									<a class="photo-link" href="/photo/{photoId}">"{photoTitle}"</a>
								{:else if item.type === 'comment'}
									{#if uHref}
										<a class="user-link" href={uHref}>{username}</a>
									{:else}{username}{/if}
									commented on
									<a class="photo-link" href="/photo/{photoId}">"{photoTitle}"</a>:
									{(p.commentBody as string)?.slice(0, 140) || ''}
								{:else if item.type === 'explore'}
									<a class="photo-link" href="/photo/{photoId}">"{photoTitle}"</a>
									hit Explore{p.rank ? ` (#${p.rank})` : ''}{p.exploreDate
										? ` on ${p.exploreDate}`
										: ''}
								{:else}
									{item.type}
								{/if}
							</div>
							<div class="meta">
								{formatRelative(
									(p.dateadded as number | undefined) ??
										Math.floor(item.created_at / 1000)
								)}
							</div>
						</div>
					</div>
				</li>
			{/each}
		</ul>
	{/if}
</section>

<style>
	.page {
		max-width: 50rem;
		margin: 1.5rem auto;
		padding: 0 1.5rem;
	}
	.page-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 1rem;
		gap: 1rem;
	}
	.page-header h1 {
		margin: 0;
		font-family: var(--font-mono);
		font-size: 1rem;
		font-weight: 500;
		text-transform: uppercase;
		letter-spacing: 0.08em;
	}
	.actions {
		display: flex;
		gap: 0.5rem;
	}
	.btn {
		background: transparent;
		border: 1px solid var(--border);
		color: var(--fg);
		padding: 0.4rem 0.8rem;
		font-family: var(--font-mono);
		font-size: 0.7rem;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		cursor: pointer;
		border-radius: 4px;
	}
	.btn:hover:not(:disabled) {
		border-color: var(--accent);
		color: var(--accent);
	}
	.btn:disabled {
		opacity: 0.5;
		cursor: progress;
	}
	.empty {
		padding: 3rem 0;
		text-align: center;
		color: var(--fg-muted);
	}
	.feed {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	.feed li {
		border: 1px solid var(--border);
		border-radius: 4px;
		overflow: hidden;
	}
	.feed li.unseen {
		border-color: rgba(255, 122, 61, 0.4);
		background: rgba(255, 122, 61, 0.04);
	}
	.card {
		display: flex;
		gap: 0.8rem;
		padding: 0.8rem;
		color: var(--fg);
	}
	.card:hover {
		background: rgba(255, 255, 255, 0.03);
	}
	.thumb-anchor {
		display: block;
		flex-shrink: 0;
		text-decoration: none;
	}
	.user-link {
		color: var(--accent);
		text-decoration: none;
	}
	.user-link:hover {
		text-decoration: underline;
	}
	.photo-link {
		color: inherit;
		text-decoration: none;
	}
	.photo-link:hover {
		text-decoration: underline;
	}
	.thumb {
		width: 96px;
		height: 96px;
		object-fit: cover;
		border-radius: 3px;
		flex-shrink: 0;
		background: #111;
	}
	.thumb-placeholder {
		background: #222;
	}
	.text {
		flex: 1;
		min-width: 0;
	}
	.type-tag {
		font-family: var(--font-mono);
		font-size: 0.6rem;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--fg-muted);
		margin-bottom: 0.25rem;
	}
	.type-explore {
		color: #ffae00;
	}
	.type-favorite {
		color: #ff5470;
	}
	.type-comment {
		color: #4ec9ff;
	}
	.summary {
		font-size: 0.95rem;
		line-height: 1.35;
	}
	.meta {
		font-family: var(--font-mono);
		font-size: 0.65rem;
		color: var(--fg-muted);
		margin-top: 0.4rem;
	}
</style>
