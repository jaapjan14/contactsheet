<script lang="ts">
	import { goto } from '$app/navigation';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let input = $state('');

	function routeFor(raw: string): string | null {
		const v = raw.trim();
		if (!v) return null;

		const groupUrl = v.match(/flickr\.com\/groups\/([^\/?\s#]+)/i);
		if (groupUrl) return `/group/${encodeURIComponent(groupUrl[1])}`;

		const userUrl = v.match(/flickr\.com\/photos\/([^\/?\s#]+)/i);
		if (userUrl) return `/user/${encodeURIComponent(userUrl[1])}/photostream`;

		const photoUrl = v.match(/flickr\.com\/photos\/[^\/]+\/(\d+)/i);
		if (photoUrl) return `/photo/${photoUrl[1]}`;

		return `/user/${encodeURIComponent(v)}/photostream`;
	}

	function submit(e: SubmitEvent) {
		e.preventDefault();
		const route = routeFor(input);
		if (route) goto(route);
	}
</script>

<section>
	{#if data.me}
		<div class="me-card">
			<a href="/user/{data.me.username}/photostream" class="me-link">
				<span class="me-label">Your photostream</span>
				<span class="me-name">{data.me.fullname || data.me.username}</span>
			</a>
			<div class="me-shortcuts">
				<a href="/user/{data.me.username}/albums">Albums</a>
				<a href="/user/{data.me.username}/faves">Faves</a>
				<a href="/user/{data.me.username}/camera-roll">Camera Roll</a>
				<a href="/user/{data.me.username}/groups">Groups</a>
				<a href="/explore">Explore</a>
			</div>
		</div>

		<h2>Look up someone else</h2>
	{:else}
		<h1>ContactSheet</h1>
		<p class="lead">A better way to look at Flickr.</p>
	{/if}

	<form onsubmit={submit}>
		<input
			type="text"
			bind:value={input}
			placeholder="Flickr username or URL"
			autocomplete="off"
			autocapitalize="none"
			spellcheck="false"
		/>
		<button type="submit" aria-label="Go">→</button>
	</form>
	<p class="hint">
		Paste a Flickr URL — user, group, or single photo — or a bare username slug.
	</p>
</section>

<style>
	section {
		max-width: 48rem;
		margin: 3rem auto;
		padding: 0 1.5rem;
	}
	h1 {
		font-family: var(--font-sans);
		font-weight: 500;
		font-size: 2.5rem;
		letter-spacing: -0.02em;
		margin: 0 0 0.5rem;
	}
	h2 {
		font-family: var(--font-sans);
		font-weight: 500;
		font-size: 1rem;
		letter-spacing: -0.005em;
		color: var(--fg-muted);
		margin: 2.5rem 0 0.75rem;
	}
	.lead {
		color: var(--fg-muted);
		margin: 0 0 2.5rem;
	}
	.me-card {
		background: var(--bg-elev);
		border: 1px solid var(--border);
		border-radius: 4px;
		padding: 1.25rem 1.5rem;
		margin-bottom: 1rem;
	}
	.me-link {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		color: var(--fg);
	}
	.me-link:hover {
		text-decoration: none;
	}
	.me-label {
		font-family: var(--font-mono);
		font-size: 0.7rem;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--fg-muted);
	}
	.me-name {
		font-family: var(--font-sans);
		font-weight: 500;
		font-size: 1.5rem;
		letter-spacing: -0.01em;
	}
	.me-shortcuts {
		display: flex;
		flex-wrap: wrap;
		gap: 0.85rem 1.25rem;
		margin-top: 0.85rem;
		padding-top: 0.85rem;
		border-top: 1px solid var(--border);
		font-family: var(--font-mono);
		font-size: 0.85rem;
	}
	form {
		display: flex;
		gap: 0.5rem;
		max-width: 32rem;
	}
	input {
		flex: 1;
		background: var(--bg-elev);
		border: 1px solid var(--border);
		color: var(--fg);
		padding: 0.7rem 0.9rem;
		font-family: var(--font-mono);
		font-size: 0.95rem;
		border-radius: 3px;
		outline: none;
		min-width: 0;
	}
	input:focus {
		border-color: var(--accent);
	}
	button {
		background: var(--accent);
		color: #111;
		border: none;
		padding: 0 1.2rem;
		font-family: var(--font-mono);
		font-size: 1rem;
		font-weight: 500;
		border-radius: 3px;
		cursor: pointer;
	}
	button:hover {
		filter: brightness(1.1);
	}
	.hint {
		margin-top: 0.6rem;
		font-family: var(--font-mono);
		font-size: 0.78rem;
		color: var(--fg-muted);
	}
	@media (max-width: 640px) {
		section {
			margin: 1.5rem auto;
		}
		h1 {
			font-size: 2rem;
		}
		.me-name {
			font-size: 1.25rem;
		}
	}
</style>
