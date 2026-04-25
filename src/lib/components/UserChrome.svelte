<script lang="ts">
	import { avatarUrl } from '$lib/flickr/urls';
	import type { FlickrPersonInfo } from '$lib/server/flickr/types';

	let {
		user,
		userKey,
		activeTab,
		subtitle,
		isSelf = false
	}: {
		user: FlickrPersonInfo;
		userKey: string;
		activeTab: string;
		subtitle: string;
		isSelf?: boolean;
	} = $props();

	interface Tab {
		slug: string;
		label: string;
		disabled?: boolean;
	}

	const tabs = $derived<Tab[]>([
		{ slug: 'photostream', label: 'Photostream' },
		{ slug: 'albums', label: 'Albums' },
		{ slug: 'faves', label: 'Faves' },
		{ slug: 'galleries', label: 'Galleries', disabled: true },
		{ slug: 'groups', label: 'Groups', disabled: true },
		...(isSelf
			? [
					{ slug: 'camera-roll', label: 'Camera Roll' },
					{ slug: 'stats', label: 'Stats' }
				]
			: [])
	]);
</script>

<header class="user-header">
	<img class="avatar" src={avatarUrl(user)} alt="" />
	<div class="who">
		<h1>{user.realname?._content || user.username._content}</h1>
		<p class="meta">
			{subtitle}
			{#if user.location} · {user.location._content}{/if}
		</p>
	</div>
</header>

<nav class="user-nav">
	{#each tabs as tab}
		{#if tab.disabled}
			<span class="tab disabled">{tab.label}</span>
		{:else}
			<a
				class="tab"
				class:active={tab.slug === activeTab}
				href="/user/{userKey}/{tab.slug}"
			>
				{tab.label}
			</a>
		{/if}
	{/each}
</nav>

<style>
	.user-header {
		display: flex;
		align-items: center;
		gap: 1rem;
		max-width: 80rem;
		margin: 2rem auto 1rem;
		padding: 0 1.5rem;
	}
	.avatar {
		width: 64px;
		height: 64px;
		border-radius: 50%;
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
	.user-nav {
		display: flex;
		gap: 1.5rem;
		max-width: 80rem;
		margin: 0 auto;
		padding: 0 1.5rem;
		border-bottom: 1px solid var(--border);
	}
	.tab {
		padding: 0.75rem 0;
		font-family: var(--font-sans);
		font-size: 0.95rem;
		color: var(--fg-muted);
		border-bottom: 2px solid transparent;
		margin-bottom: -1px;
	}
	.tab.active {
		color: var(--fg);
		border-bottom-color: var(--accent);
	}
	.tab.disabled {
		color: #444;
		cursor: not-allowed;
	}
	.tab:not(.disabled):hover {
		color: var(--fg);
		text-decoration: none;
	}
</style>
