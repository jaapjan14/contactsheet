<script lang="ts">
	import UserChrome from '$lib/components/UserChrome.svelte';
	import { decodeFlickrEntities } from '$lib/flickr/text';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	type Sort = 'default' | 'name' | 'activity';
	let query = $state('');
	let sort = $state<Sort>('default');

	// dateactivity (unix seconds, string) per group NSID — populated lazily
	// the first time the user selects the Activity sort. Pages with ~100
	// groups hit the cache after the first crawl, so subsequent renders are
	// effectively instant.
	let activityMap = $state<Record<string, string | null>>({});
	let activityLoading = $state(false);
	let activityError: string | null = $state(null);

	async function loadActivity() {
		if (activityLoading || Object.keys(activityMap).length > 0) return;
		activityLoading = true;
		activityError = null;
		try {
			const ids = data.groups.map((g) => g.nsid).join(',');
			const res = await fetch(`/api/groups/activity?ids=${encodeURIComponent(ids)}`);
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			const body = (await res.json()) as { activity: Record<string, string | null> };
			activityMap = body.activity ?? {};
		} catch (err) {
			activityError = (err as Error).message;
		} finally {
			activityLoading = false;
		}
	}

	async function pickActivity() {
		sort = 'activity';
		await loadActivity();
	}

	function relativeDate(unixSeconds: string): string {
		const t = Number(unixSeconds) * 1000;
		if (!t) return '';
		const diffMs = Date.now() - t;
		const m = Math.floor(diffMs / 60_000);
		if (m < 1) return 'just now';
		if (m < 60) return `${m}m ago`;
		const h = Math.floor(m / 60);
		if (h < 24) return `${h}h ago`;
		const d = Math.floor(h / 24);
		if (d < 30) return `${d}d ago`;
		const mo = Math.floor(d / 30);
		if (mo < 12) return `${mo}mo ago`;
		const y = Math.floor(mo / 12);
		return `${y}y ago`;
	}

	const view = $derived.by(() => {
		const q = query.trim().toLowerCase();
		const decoded = data.groups.map((g) => ({
			...g,
			displayName: decodeFlickrEntities(g.name)
		}));
		const filtered = q
			? decoded.filter((g) => g.displayName.toLowerCase().includes(q))
			: decoded;
		if (sort === 'name') {
			return [...filtered].sort((a, b) => a.displayName.localeCompare(b.displayName));
		}
		if (sort === 'activity') {
			return [...filtered].sort((a, b) => {
				const ta = Number(activityMap[a.nsid] ?? 0);
				const tb = Number(activityMap[b.nsid] ?? 0);
				return tb - ta; // descending
			});
		}
		return filtered;
	});
</script>

<UserChrome
	user={data.user}
	userKey={data.userKey}
	activeTab="groups"
	subtitle="{data.groups.length.toLocaleString()} groups"
	isSelf={data.me?.nsid === data.user.nsid}
/>

{#if data.needsFlickrAuth}
	<p class="empty">
		<a href="/auth/start">Sign in to Flickr</a> to view group memberships.
	</p>
{:else if data.groups.length === 0}
	<p class="empty">Not a member of any public groups.</p>
{:else}
	<div class="toolbar">
		<input
			type="search"
			placeholder="Filter {data.groups.length} groups…"
			bind:value={query}
			autocomplete="off"
		/>
		<div class="sort">
			<button class:active={sort === 'default'} onclick={() => (sort = 'default')}>
				Joined
			</button>
			<button class:active={sort === 'name'} onclick={() => (sort = 'name')}>
				A–Z
			</button>
			<button
				class:active={sort === 'activity'}
				onclick={pickActivity}
				disabled={activityLoading}
				title={activityLoading
					? 'Fetching last-activity for each group…'
					: 'Sort by most recent group activity'}
			>
				{activityLoading ? 'Activity…' : 'Activity'}
			</button>
		</div>
	</div>
	{#if activityError}
		<p class="activity-error">Couldn't load activity: {activityError}.</p>
	{/if}
	{#if view.length === 0}
		<p class="empty">No matches.</p>
	{:else}
		<ul class="groups">
			{#each view as g (g.nsid)}
				{@const ts = activityMap[g.nsid]}
				<li>
					<a href="/group/{g.nsid}">
						<span class="name">{g.displayName}</span>
						{#if g.admin}<span class="role admin">admin</span>{/if}
						{#if g.invitation_only}<span class="role invite">invite-only</span>{/if}
						{#if sort === 'activity' && ts}
							<span class="activity-meta" title={new Date(Number(ts) * 1000).toLocaleString()}>
								active {relativeDate(ts)}
							</span>
						{/if}
					</a>
				</li>
			{/each}
		</ul>
	{/if}
{/if}

<style>
	.toolbar {
		display: flex;
		gap: 0.5rem;
		max-width: 80rem;
		margin: 1.5rem auto 0.5rem;
		padding: 0 1.5rem;
		align-items: center;
	}
	.toolbar input[type='search'] {
		flex: 1;
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
	.toolbar input[type='search']:focus {
		border-color: var(--accent);
	}
	.sort {
		display: flex;
		gap: 2px;
		background: var(--bg-elev);
		border: 1px solid var(--border);
		border-radius: 3px;
		padding: 2px;
	}
	.sort button {
		background: transparent;
		border: none;
		color: var(--fg-muted);
		font-family: var(--font-mono);
		font-size: 0.78rem;
		padding: 0.4rem 0.7rem;
		border-radius: 2px;
		cursor: pointer;
	}
	.sort button.active {
		background: var(--bg);
		color: var(--fg);
	}
	.sort button:hover {
		color: var(--fg);
	}
	.groups {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
		gap: 4px;
		max-width: 80rem;
		margin: 0.5rem auto 1.5rem;
		padding: 0 1.5rem;
		list-style: none;
	}
	.groups li {
		margin: 0;
	}
	.groups a {
		display: flex;
		flex-direction: column;
		justify-content: center;
		align-items: center;
		text-align: center;
		gap: 0.4rem;
		min-height: 5rem;
		padding: 1rem 0.75rem;
		background: var(--bg-elev);
		border: 1px solid var(--border);
		border-radius: 3px;
		color: var(--fg);
		transition: border-color 0.15s ease, transform 0.15s ease;
	}
	.groups a:hover {
		border-color: var(--accent);
		text-decoration: none;
		transform: translateY(-1px);
	}
	.name {
		font-family: var(--font-sans);
		font-size: 0.95rem;
		font-weight: 500;
		letter-spacing: -0.005em;
	}
	.role {
		font-family: var(--font-mono);
		font-size: 0.65rem;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		padding: 0.1rem 0.45rem;
		border-radius: 2px;
		background: var(--bg);
		border: 1px solid var(--border);
	}
	.role.admin {
		color: var(--accent);
		border-color: var(--accent);
	}
	.activity-meta {
		font-family: var(--font-mono);
		font-size: 0.7rem;
		color: var(--fg-muted);
		margin-top: 0.1rem;
	}
	.activity-error {
		max-width: 80rem;
		margin: 0.3rem auto 0;
		padding: 0 1.5rem;
		font-family: var(--font-mono);
		font-size: 0.78rem;
		color: #ff7a3d;
	}
	.sort button:disabled {
		opacity: 0.6;
		cursor: progress;
	}
	.empty {
		text-align: center;
		font-family: var(--font-mono);
		font-size: 0.85rem;
		color: var(--fg-muted);
		padding: 4rem 1.5rem;
	}
</style>
