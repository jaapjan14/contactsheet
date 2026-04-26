<script lang="ts">
	import favicon from '$lib/assets/favicon.svg';
	import { onNavigate } from '$app/navigation';
	import { page } from '$app/stores';
	import type { Snippet } from 'svelte';
	import type { LayoutData } from './$types';

	let { data, children }: { data: LayoutData; children: Snippet } = $props();

	const isLoginPage = $derived($page.url.pathname === '/login');

	onNavigate((navigation) => {
		if (typeof document === 'undefined' || !('startViewTransition' in document)) return;
		// Skip view transitions on browser back/forward (popstate). Back from
		// the lightbox to a 100-thumbnail grid was triggering visible jitter
		// because the browser has to snapshot every named element before the
		// cross-fade. The user expects "back" to be instant; the morph effect
		// only adds value going forward.
		if (navigation.type === 'popstate') return;
		return new Promise((resolve) => {
			(document as Document & {
				startViewTransition: (cb: () => Promise<void>) => unknown;
			}).startViewTransition(async () => {
				resolve();
				await navigation.complete;
			});
		});
	});
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<title>ContactSheet</title>
</svelte:head>

{#if !isLoginPage}
<header>
	<a href="/" class="brand">ContactSheet</a>
	<span class="tagline">a contact sheet for Flickr</span>
	<a href="/explore" class="nav-link">Explore</a>
	<form class="search" method="get" action="/search" role="search">
		<input
			name="q"
			type="search"
			placeholder="Search Flickr…"
			autocomplete="off"
			aria-label="Search"
		/>
	</form>
	<span class="spacer"></span>
	{#if data.me}
		<a href="/user/{data.me.username}/photostream" class="me">
			{data.me.fullname || data.me.username}
		</a>
		<form method="POST" action="/auth/logout" class="logout-form">
			<button type="submit" class="logout" title="Sign out of Flickr">flickr →</button>
		</form>
	{:else}
		<a href="/auth/start" class="signin">sign in to Flickr</a>
	{/if}
	<form method="POST" action="/logout" class="logout-form">
		<button type="submit" class="logout" title="Lock ContactSheet (clears app session)">
			🔒
		</button>
	</form>
</header>
{/if}

{@render children()}

<style>
	:global(:root) {
		--bg: #111111;
		--bg-elev: #1a1a1a;
		--fg: #e8e8e8;
		--fg-muted: #888888;
		--accent: #ff7a3d;
		--border: #2a2a2a;
		--font-sans: 'IBM Plex Sans', system-ui, -apple-system, sans-serif;
		--font-mono: 'IBM Plex Mono', ui-monospace, SFMono-Regular, monospace;
	}
	:global(html, body) {
		background: var(--bg);
		color: var(--fg);
		margin: 0;
		font-family: var(--font-sans);
		-webkit-font-smoothing: antialiased;
	}
	:global(a) {
		color: var(--accent);
		text-decoration: none;
	}
	:global(a:hover) {
		text-decoration: underline;
	}
	:global(::view-transition-old(root)),
	:global(::view-transition-new(root)) {
		animation-duration: 0.18s;
	}
	header {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 0.5rem 0.85rem;
		padding: 0.85rem 1.25rem;
		border-bottom: 1px solid var(--border);
	}
	.brand {
		font-family: var(--font-mono);
		font-weight: 500;
		color: var(--fg);
		letter-spacing: -0.01em;
		font-size: 1rem;
	}
	.tagline {
		color: var(--fg-muted);
		font-size: 0.78rem;
		font-family: var(--font-mono);
		white-space: nowrap;
	}
	.nav-link {
		font-family: var(--font-mono);
		font-size: 0.8rem;
		color: var(--fg-muted);
	}
	.nav-link:hover {
		color: var(--fg);
		text-decoration: none;
	}
	.spacer {
		flex: 1 1 0;
		min-width: 0;
	}
	.search {
		margin: 0;
		display: flex;
	}
	.search input {
		background: var(--bg-elev);
		border: 1px solid var(--border);
		color: var(--fg);
		padding: 0.45rem 0.7rem;
		font-family: var(--font-mono);
		font-size: 0.8rem;
		border-radius: 3px;
		outline: none;
		width: 14rem;
		max-width: 30vw;
	}
	.search input:focus {
		border-color: var(--accent);
	}
	.me,
	.signin,
	.logout {
		font-family: var(--font-mono);
		font-size: 0.8rem;
	}
	.me {
		color: var(--fg);
	}
	.signin {
		color: var(--accent);
	}
	.logout-form {
		margin: 0;
	}
	.logout {
		background: none;
		border: none;
		color: var(--fg-muted);
		cursor: pointer;
		padding: 0.1rem 0.25rem;
		font-size: 1rem;
		line-height: 1;
	}
	.logout:hover {
		color: var(--fg);
	}

	/* On mobile (≤640px): hide the tagline, no flex-spacer (everything left-
	   packed), and the search input wraps to its own row spanning the full
	   header width — same shape as Darkroom Log's header on phones. */
	@media (max-width: 640px) {
		header {
			padding: 0.7rem 1rem;
			gap: 0.4rem 0.7rem;
		}
		.tagline {
			display: none;
		}
		.spacer {
			display: none;
		}
		.search {
			order: 10;
			flex-basis: 100%;
		}
		.search input {
			width: 100%;
			max-width: none;
			padding: 0.55rem 0.75rem;
			font-size: 0.9rem;
		}
		.me {
			max-width: 7rem;
			overflow: hidden;
			text-overflow: ellipsis;
			white-space: nowrap;
		}
	}
</style>
