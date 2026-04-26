<script lang="ts">
	import { onMount, onDestroy } from 'svelte';

	interface NotificationItem {
		id: number;
		type: 'explore' | 'favorite' | 'comment';
		source_id: string;
		seen_at: number | null;
		created_at: number;
		payload: {
			photoId: string;
			photoTitle: string;
			photoSecret?: string;
			photoServer?: string;
			user?: string;
			username?: string;
			dateadded?: number;
			commentBody?: string;
			exploreDate?: string;
			rank?: number;
		};
	}

	let unread = $state(0);
	let open = $state(false);
	let items = $state<NotificationItem[]>([]);
	let loading = $state(false);
	let pollTimer: ReturnType<typeof setInterval> | null = null;

	async function fetchUnread() {
		try {
			const res = await fetch('/api/notifications/unread-count');
			if (!res.ok) return;
			const data = (await res.json()) as { count: number };
			unread = data.count;
		} catch {
			/* ignore */
		}
	}

	async function fetchList() {
		loading = true;
		try {
			const res = await fetch('/api/notifications?limit=10');
			if (!res.ok) return;
			const data = (await res.json()) as { items: NotificationItem[] };
			items = data.items;
		} finally {
			loading = false;
		}
	}

	async function toggle() {
		open = !open;
		if (open) {
			await fetchList();
		}
	}

	async function markAllSeen() {
		await fetch('/api/notifications/mark-seen', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ all: true })
		});
		unread = 0;
		await fetchList();
	}

	function thumbUrl(p: NotificationItem['payload']) {
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

	function userHref(p: NotificationItem['payload']): string | null {
		// Prefer NSID for stable links; fall back to username if that's all we
		// have (Flickr accepts path_alias-style usernames in the resolver too).
		const id = p.user || p.username;
		return id ? `/user/${id}/photostream` : null;
	}

	onMount(() => {
		fetchUnread();
		pollTimer = setInterval(fetchUnread, 60_000);
	});

	onDestroy(() => {
		if (pollTimer) clearInterval(pollTimer);
	});

	function handleDocClick(e: MouseEvent) {
		if (!open) return;
		const target = e.target as HTMLElement;
		if (!target.closest('.notifications-bell')) open = false;
	}
</script>

<svelte:document onclick={handleDocClick} />

<div class="notifications-bell">
	<button class="bell-btn" type="button" onclick={toggle} aria-label="Notifications">
		<span class="bell-icon" aria-hidden="true">🔔</span>
		{#if unread > 0}
			<span class="badge">{unread > 99 ? '99+' : unread}</span>
		{/if}
	</button>

	{#if open}
		<div class="dropdown" role="dialog" aria-label="Recent notifications">
			<header class="drop-header">
				<span>Notifications</span>
				{#if unread > 0}
					<button class="link-btn" type="button" onclick={markAllSeen}>Mark all read</button>
				{/if}
			</header>

			{#if loading && items.length === 0}
				<div class="empty">Loading…</div>
			{:else if items.length === 0}
				<div class="empty">No notifications yet.</div>
			{:else}
				<ul class="items">
					{#each items as item (item.id)}
						<li class:unseen={item.seen_at === null}>
							<div class="item-link">
								<a href="/photo/{item.payload.photoId}" class="thumb-anchor" aria-label="Open photo">
									{#if thumbUrl(item.payload)}
										<img class="thumb" src={thumbUrl(item.payload)} alt="" />
									{:else}
										<div class="thumb thumb-placeholder"></div>
									{/if}
								</a>
								<div class="text">
									<div class="summary">
										{#if item.type === 'favorite' || item.type === 'comment'}
											{#if userHref(item.payload)}
												<a class="user-link" href={userHref(item.payload)}
													>{item.payload.username ?? 'Someone'}</a
												>
											{:else}
												{item.payload.username ?? 'Someone'}
											{/if}
											{item.type === 'favorite' ? ' faved ' : ' commented on '}
											<a class="photo-link" href="/photo/{item.payload.photoId}"
												>"{item.payload.photoTitle || 'Untitled'}"</a
											>
										{:else if item.type === 'explore'}
											<a class="photo-link" href="/photo/{item.payload.photoId}"
												>"{item.payload.photoTitle || 'Untitled'}"</a
											>
											hit Explore{item.payload.rank ? ` (#${item.payload.rank})` : ''}
										{:else}
											{item.type}
										{/if}
									</div>
									<div class="meta">
										{#if item.payload.dateadded}
											{formatRelative(item.payload.dateadded)}
										{:else}
											{formatRelative(Math.floor(item.created_at / 1000))}
										{/if}
									</div>
								</div>
							</div>
						</li>
					{/each}
				</ul>
				<footer class="drop-footer">
					<a href="/notifications">See all</a>
				</footer>
			{/if}
		</div>
	{/if}
</div>

<style>
	.notifications-bell {
		position: relative;
	}
	.bell-btn {
		background: transparent;
		border: none;
		color: var(--fg, #e8e8e8);
		font-size: 1rem;
		padding: 0.25rem 0.5rem;
		cursor: pointer;
		position: relative;
	}
	.bell-icon {
		filter: grayscale(0.4);
	}
	.badge {
		position: absolute;
		top: -2px;
		right: -2px;
		background: #ff3b3b;
		color: #fff;
		font-family: var(--font-mono, ui-monospace, monospace);
		font-size: 0.6rem;
		padding: 0.1rem 0.3rem;
		border-radius: 10px;
		min-width: 1rem;
		text-align: center;
		line-height: 1;
	}
	.dropdown {
		position: absolute;
		right: 0;
		top: calc(100% + 0.4rem);
		width: 22rem;
		max-width: calc(100vw - 1rem);
		background: var(--bg-elev, #1a1a1a);
		border: 1px solid var(--border, #2a2a2a);
		border-radius: 6px;
		box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
		z-index: 1000;
	}
	.drop-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.6rem 0.8rem;
		border-bottom: 1px solid var(--border, #2a2a2a);
		font-family: var(--font-mono, ui-monospace, monospace);
		font-size: 0.7rem;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--fg-muted, #888);
	}
	.link-btn {
		background: transparent;
		border: none;
		color: var(--accent, #ff7a3d);
		font-family: inherit;
		font-size: inherit;
		text-transform: inherit;
		letter-spacing: inherit;
		cursor: pointer;
		padding: 0;
	}
	.link-btn:hover {
		text-decoration: underline;
	}
	.items {
		list-style: none;
		margin: 0;
		padding: 0;
		max-height: 26rem;
		overflow-y: auto;
	}
	.items li {
		border-bottom: 1px solid var(--border, #2a2a2a);
	}
	.items li:last-child {
		border-bottom: none;
	}
	.items li.unseen {
		background: rgba(255, 122, 61, 0.05);
	}
	.item-link {
		display: flex;
		gap: 0.6rem;
		padding: 0.6rem 0.8rem;
		color: var(--fg, #e8e8e8);
	}
	.item-link:hover {
		background: rgba(255, 255, 255, 0.04);
	}
	.thumb-anchor {
		display: block;
		flex-shrink: 0;
		text-decoration: none;
	}
	.user-link {
		color: var(--accent, #ff7a3d);
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
		width: 48px;
		height: 48px;
		object-fit: cover;
		border-radius: 3px;
		background: #111;
		flex-shrink: 0;
	}
	.thumb-placeholder {
		background: #222;
	}
	.text {
		flex: 1;
		min-width: 0;
	}
	.summary {
		font-size: 0.82rem;
		line-height: 1.25;
		overflow: hidden;
		text-overflow: ellipsis;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
	}
	.meta {
		font-family: var(--font-mono, ui-monospace, monospace);
		font-size: 0.65rem;
		color: var(--fg-muted, #888);
		margin-top: 0.15rem;
	}
	.empty {
		padding: 1.5rem 0.8rem;
		text-align: center;
		color: var(--fg-muted, #888);
		font-size: 0.85rem;
	}
	.drop-footer {
		padding: 0.5rem 0.8rem;
		text-align: center;
		border-top: 1px solid var(--border, #2a2a2a);
	}
	.drop-footer a {
		color: var(--accent, #ff7a3d);
		font-family: var(--font-mono, ui-monospace, monospace);
		font-size: 0.7rem;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		text-decoration: none;
	}
	.drop-footer a:hover {
		text-decoration: underline;
	}
</style>
