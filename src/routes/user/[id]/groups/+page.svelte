<script lang="ts">
	import UserChrome from '$lib/components/UserChrome.svelte';
	import { decodeFlickrEntities } from '$lib/flickr/text';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	type Sort = 'default' | 'name';
	let query = $state('');
	let sort = $state<Sort>('default');

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

{#if data.groups.length === 0}
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
		</div>
	</div>
	{#if view.length === 0}
		<p class="empty">No matches.</p>
	{:else}
		<ul class="groups">
			{#each view as g (g.nsid)}
				<li>
					<a href="/group/{g.nsid}">
						<span class="name">{g.displayName}</span>
						{#if g.admin}<span class="role admin">admin</span>{/if}
						{#if g.invitation_only}<span class="role invite">invite-only</span>{/if}
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
	.empty {
		text-align: center;
		font-family: var(--font-mono);
		font-size: 0.85rem;
		color: var(--fg-muted);
		padding: 4rem 1.5rem;
	}
</style>
