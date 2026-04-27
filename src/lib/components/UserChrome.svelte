<script lang="ts">
	import { onMount, untrack } from 'svelte';
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

	// Follow indicator: lazy-fetched after mount because contacts.getList is
	// auth-only and we don't want to block any user page on it. The endpoint
	// gracefully reports { signedIn: false } for anonymous viewers, in which
	// case we render nothing.
	type FollowState = {
		signedIn: boolean;
		following: boolean;
		isSelf: boolean;
	};
	let followState = $state<FollowState | null>(null);
	const flickrPeopleUrl = $derived(`https://www.flickr.com/people/${user.nsid}/`);

	onMount(() => {
		let cancelled = false;
		(async () => {
			try {
				const res = await fetch(
					`/api/contacts/state?nsid=${encodeURIComponent(user.nsid)}`
				);
				if (!res.ok) return;
				const data = (await res.json()) as FollowState;
				if (!cancelled) followState = data;
			} catch {
				/* fail silently — not worth blocking the page */
			}
		})();
		return () => {
			cancelled = true;
		};
	});

	// Re-fetch when navigating between user pages (the same component instance
	// stays mounted while activeTab changes, but the user prop swaps when you
	// jump from /user/A/photostream to /user/B/photostream).
	let lastNsid = untrack(() => user.nsid);
	$effect(() => {
		if (user.nsid === lastNsid) return;
		lastNsid = user.nsid;
		followState = null;
		fetch(`/api/contacts/state?nsid=${encodeURIComponent(user.nsid)}`)
			.then((r) => (r.ok ? r.json() : null))
			.then((d: FollowState | null) => {
				if (d && user.nsid === lastNsid) followState = d;
			})
			.catch(() => {});
	});

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
	{#if followState && followState.signedIn && !followState.isSelf}
		{#if followState.following}
			<a
				class="follow-badge following"
				href={flickrPeopleUrl}
				target="_blank"
				rel="noopener"
				title="You follow this person on Flickr — manage on flickr.com"
			>
				✓ Following
			</a>
		{:else}
			<a
				class="follow-badge follow"
				href={flickrPeopleUrl}
				target="_blank"
				rel="noopener"
				title="Open Flickr to add as a contact"
			>
				+ Follow on Flickr
			</a>
		{/if}
	{/if}
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
	.follow-badge {
		margin-left: auto;
		font-family: var(--font-mono);
		font-size: 0.78rem;
		padding: 0.4rem 0.85rem;
		border-radius: 3px;
		text-decoration: none;
		white-space: nowrap;
		transition: border-color 0.15s, color 0.15s;
	}
	.follow-badge.following {
		color: #6cd58a;
		border: 1px solid #2c5a3a;
		background: rgba(108, 213, 138, 0.06);
	}
	.follow-badge.following:hover {
		border-color: #6cd58a;
		text-decoration: none;
	}
	.follow-badge.follow {
		color: var(--accent);
		border: 1px solid var(--border);
		background: var(--bg-elev);
	}
	.follow-badge.follow:hover {
		border-color: var(--accent);
		text-decoration: none;
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
