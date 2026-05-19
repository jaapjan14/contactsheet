<script lang="ts">
	import { page } from '$app/stores';

	// The route param we tried to resolve. We surface it in the guidance below
	// so the user can copy-paste it into the Flickr people-search shortcut.
	const userKey = $derived($page.params.id ?? '');
	const status = $derived($page.status);
	const message = $derived($page.error?.message ?? 'Something went wrong.');

	const flickrSearchUrl = $derived(
		`https://www.flickr.com/search/people/?q=${encodeURIComponent(userKey)}`
	);
	const contactSheetSearchUrl = $derived(
		`/search?q=${encodeURIComponent(userKey)}`
	);
</script>

<section>
	<h1>{status}</h1>
	<p class="message">{message}</p>

	{#if status === 404}
		<div class="guidance">
			<h2>How to find someone on ContactSheet</h2>
			<p>
				Flickr's API doesn't let third-party apps search users by display
				name. ContactSheet can only resolve:
			</p>
			<ul>
				<li>A Flickr <strong>URL</strong> — e.g. <code>https://www.flickr.com/photos/andyjohn990099/</code></li>
				<li>A user's <strong>path-alias slug</strong> — the bit after <code>/photos/</code> in their URL</li>
				<li>A user's <strong>NSID</strong> — e.g. <code>35143787@N04</code></li>
			</ul>

			{#if userKey}
				<p class="next-steps">
					Looking for someone named <strong>{userKey}</strong>? Try:
				</p>
				<div class="actions">
					<a class="action" href={flickrSearchUrl} target="_blank" rel="noopener">
						<span class="action-label">Find them on flickr.com</span>
						<span class="action-hint">opens Flickr's People search → copy their URL back into ContactSheet</span>
					</a>
					<a class="action" href={contactSheetSearchUrl}>
						<span class="action-label">Search photos mentioning "{userKey}"</span>
						<span class="action-hint">browses ContactSheet's photo search instead</span>
					</a>
					<a class="action" href="/">
						<span class="action-label">← Back home</span>
					</a>
				</div>
			{:else}
				<p><a href="/">← Back home</a></p>
			{/if}
		</div>
	{:else}
		<p><a href="/">← Back home</a></p>
	{/if}
</section>

<style>
	section {
		max-width: 44rem;
		margin: 3rem auto;
		padding: 0 1.5rem;
		font-family: var(--font-sans);
	}
	h1 {
		font-family: var(--font-sans);
		font-weight: 500;
		font-size: 3rem;
		letter-spacing: -0.02em;
		margin: 0 0 0.4rem;
	}
	.message {
		color: var(--fg-muted);
		margin: 0 0 2rem;
	}
	.guidance {
		border: 1px solid var(--border);
		border-radius: 4px;
		padding: 1.25rem 1.5rem;
		background: var(--bg-elev);
	}
	.guidance h2 {
		margin: 0 0 0.6rem;
		font-weight: 500;
		font-size: 1.1rem;
		letter-spacing: -0.01em;
	}
	.guidance p {
		margin: 0 0 0.85rem;
		font-size: 0.92rem;
		line-height: 1.5;
		color: var(--fg);
	}
	.guidance ul {
		margin: 0 0 1rem;
		padding-left: 1.25rem;
		font-size: 0.9rem;
		line-height: 1.6;
	}
	.guidance code {
		font-family: var(--font-mono);
		font-size: 0.85em;
		background: var(--bg);
		padding: 0.05rem 0.3rem;
		border-radius: 2px;
		color: var(--fg);
	}
	.next-steps {
		margin: 1.2rem 0 0.6rem;
		color: var(--fg-muted);
		font-size: 0.88rem;
	}
	.next-steps strong {
		color: var(--fg);
	}
	.actions {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}
	.action {
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
		padding: 0.6rem 0.85rem;
		background: var(--bg);
		border: 1px solid var(--border);
		border-radius: 3px;
		text-decoration: none;
	}
	.action:hover {
		border-color: var(--accent);
		text-decoration: none;
	}
	.action-label {
		color: var(--accent);
		font-family: var(--font-sans);
		font-size: 0.95rem;
		font-weight: 500;
	}
	.action-hint {
		color: var(--fg-muted);
		font-family: var(--font-mono);
		font-size: 0.72rem;
	}
</style>
