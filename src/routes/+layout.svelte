<script lang="ts">
	import favicon from '$lib/assets/favicon.svg';
	import { onNavigate } from '$app/navigation';
	import type { Snippet } from 'svelte';
	import type { LayoutData } from './$types';

	let { data, children }: { data: LayoutData; children: Snippet } = $props();

	onNavigate((navigation) => {
		if (typeof document === 'undefined' || !('startViewTransition' in document)) return;
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

<header>
	<a href="/" class="brand">ContactSheet</a>
	<span class="tagline">a contact sheet for Flickr</span>
	<span class="spacer"></span>
	{#if data.me}
		<a href="/user/{data.me.username}/photostream" class="me">
			{data.me.fullname || data.me.username}
		</a>
		<form method="POST" action="/auth/logout" class="logout-form">
			<button type="submit" class="logout">log out</button>
		</form>
	{:else}
		<a href="/auth/start" class="signin">sign in to Flickr</a>
	{/if}
</header>

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
		align-items: baseline;
		gap: 0.75rem;
		padding: 1rem 1.5rem;
		border-bottom: 1px solid var(--border);
	}
	.brand {
		font-family: var(--font-mono);
		font-weight: 500;
		color: var(--fg);
		letter-spacing: -0.01em;
	}
	.tagline {
		color: var(--fg-muted);
		font-size: 0.8rem;
		font-family: var(--font-mono);
	}
	.spacer {
		flex: 1;
	}
	.me,
	.signin,
	.logout {
		font-family: var(--font-mono);
		font-size: 0.78rem;
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
		padding: 0;
	}
	.logout:hover {
		color: var(--fg);
	}
</style>
