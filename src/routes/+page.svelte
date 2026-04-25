<script lang="ts">
	import { goto } from '$app/navigation';

	let input = $state('');

	function routeFor(raw: string): string | null {
		const v = raw.trim();
		if (!v) return null;

		// Full Flickr URLs (paste-friendly)
		const groupUrl = v.match(/flickr\.com\/groups\/([^\/?\s#]+)/i);
		if (groupUrl) return `/group/${encodeURIComponent(groupUrl[1])}`;

		const userUrl = v.match(/flickr\.com\/photos\/([^\/?\s#]+)/i);
		if (userUrl) return `/user/${encodeURIComponent(userUrl[1])}/photostream`;

		const photoUrl = v.match(/flickr\.com\/photos\/[^\/]+\/(\d+)/i);
		if (photoUrl) return `/photo/${photoUrl[1]}`;

		// Bare slug → default to user
		return `/user/${encodeURIComponent(v)}/photostream`;
	}

	function submit(e: SubmitEvent) {
		e.preventDefault();
		const route = routeFor(input);
		if (route) goto(route);
	}
</script>

<section>
	<h1>ContactSheet</h1>
	<p class="lead">A better way to look at Flickr.</p>

	<form onsubmit={submit}>
		<input
			type="text"
			bind:value={input}
			placeholder="Flickr username or URL slug"
			autocomplete="off"
			autocapitalize="none"
			spellcheck="false"
		/>
		<button type="submit" aria-label="Open photostream">→</button>
	</form>
	<p class="hint">
		Paste a Flickr URL — user (<code>flickr.com/photos/…</code>),
		group (<code>flickr.com/groups/…</code>), or single photo. A bare slug like
		<code>lakatua</code> is treated as a user.
	</p>

	<p class="links">
		<a href="/health">/health</a> — verify API key
	</p>
</section>

<style>
	section {
		max-width: 48rem;
		margin: 6rem auto;
		padding: 0 1.5rem;
	}
	h1 {
		font-family: var(--font-sans);
		font-weight: 500;
		font-size: 2.5rem;
		letter-spacing: -0.02em;
		margin: 0 0 0.5rem;
	}
	.lead {
		color: var(--fg-muted);
		margin: 0 0 2.5rem;
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
	.hint code {
		color: #c8c8c8;
	}
	.links {
		margin-top: 3rem;
		font-family: var(--font-mono);
		font-size: 0.85rem;
		color: var(--fg-muted);
	}
</style>
