<script lang="ts">
	import UserChrome from '$lib/components/UserChrome.svelte';
	import { decodeFlickrEntities } from '$lib/flickr/text';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
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
	<ul class="groups">
		{#each data.groups as g (g.nsid)}
			<li>
				<a href="/group/{g.nsid}">
					<span class="name">{decodeFlickrEntities(g.name)}</span>
					{#if g.admin}<span class="role admin">admin</span>{/if}
					{#if g.invitation_only}<span class="role invite">invite-only</span>{/if}
					{#if g.eighteenplus}<span class="role nsfw">18+</span>{/if}
				</a>
			</li>
		{/each}
	</ul>
{/if}

<style>
	.groups {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
		gap: 4px;
		max-width: 80rem;
		margin: 1.5rem auto;
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
	.role.nsfw {
		color: #d96a6a;
		border-color: #5a3030;
	}
	.empty {
		text-align: center;
		font-family: var(--font-mono);
		font-size: 0.85rem;
		color: var(--fg-muted);
		padding: 4rem 1.5rem;
	}
</style>
