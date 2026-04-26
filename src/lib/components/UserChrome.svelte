<script lang="ts">
	import { goto } from '$app/navigation';
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
	}

	const tabs = $derived<Tab[]>([
		{ slug: 'about', label: 'About' },
		{ slug: 'photostream', label: 'Photostream' },
		{ slug: 'albums', label: 'Albums' },
		{ slug: 'faves', label: 'Faves' },
		{ slug: 'galleries', label: 'Galleries' },
		{ slug: 'groups', label: 'Groups' },
		...(isSelf
			? [
					{ slug: 'camera-roll', label: 'Camera Roll' },
					{ slug: 'stats', label: 'Stats' }
				]
			: [])
	]);

	function navTab(e: Event) {
		const select = e.target as HTMLSelectElement;
		const slug = select.value;
		// Reset the select after handling so re-picking the same option still fires
		const restore = () => {
			select.value = activeTab;
		};
		if (slug.startsWith('_')) {
			// Special non-tab destinations
			if (slug === '_explore') goto('/explore');
			else if (slug === '_home') goto('/');
			restore();
			return;
		}
		if (slug && slug !== activeTab) goto(`/user/${userKey}/${slug}`);
	}
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

<!-- Desktop: horizontal tab bar.  Hidden on ≤640px. -->
<nav class="user-nav">
	{#each tabs as tab (tab.slug)}
		<a
			class="tab"
			class:active={tab.slug === activeTab}
			href="/user/{userKey}/{tab.slug}"
		>
			{tab.label}
		</a>
	{/each}
</nav>

<!-- Mobile: native <select>.  Compact, no horizontal-scroll-hidden-affordance. -->
<div class="user-nav-select">
	<select aria-label="Section" value={activeTab} onchange={navTab}>
		<optgroup label={user.username._content}>
			{#each tabs as tab (tab.slug)}
				<option value={tab.slug} selected={tab.slug === activeTab}>{tab.label}</option>
			{/each}
		</optgroup>
		<optgroup label="Browse">
			<option value="_home">ContactSheet</option>
			<option value="_explore">Explore</option>
		</optgroup>
	</select>
</div>

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
		overflow-x: auto;
		scrollbar-width: none;
	}
	.user-nav::-webkit-scrollbar {
		display: none;
	}
	.tab {
		padding: 0.75rem 0;
		font-family: var(--font-sans);
		font-size: 0.95rem;
		color: var(--fg-muted);
		border-bottom: 2px solid transparent;
		margin-bottom: -1px;
		flex-shrink: 0;
		white-space: nowrap;
	}
	.tab.active {
		color: var(--fg);
		border-bottom-color: var(--accent);
	}
	.tab:hover {
		color: var(--fg);
		text-decoration: none;
	}
	.user-nav-select {
		display: none;
	}

	@media (max-width: 640px) {
		.user-header {
			margin: 0.5rem auto 0.5rem;
			padding: 0 1rem;
			gap: 0.65rem;
		}
		.avatar {
			width: 40px;
			height: 40px;
		}
		.who h1 {
			font-size: 1.05rem;
		}
		.meta {
			font-size: 0.72rem;
			margin-top: 0.1rem;
		}

		/* Swap the tab bar for a native <select> */
		.user-nav {
			display: none;
		}
		.user-nav-select {
			display: flex;
			max-width: 80rem;
			margin: 0 auto;
			padding: 0.4rem 1rem 0.6rem;
			border-bottom: 1px solid var(--border);
		}
		.user-nav-select select {
			flex: 1;
			background: var(--bg-elev);
			border: 1px solid var(--border);
			color: var(--fg);
			padding: 0.5rem 0.7rem;
			padding-right: 2rem;
			font-family: var(--font-sans);
			font-size: 0.9rem;
			border-radius: 3px;
			outline: none;
			appearance: none;
			-webkit-appearance: none;
			cursor: pointer;
			background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 8'><path fill='%23888' d='M1 1l5 5 5-5'/></svg>");
			background-repeat: no-repeat;
			background-position: right 0.7rem center;
			background-size: 0.7rem;
		}
		.user-nav-select select:focus {
			border-color: var(--accent);
		}
	}
</style>
