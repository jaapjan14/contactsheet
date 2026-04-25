<script lang="ts">
	import type { PageData } from './$types';
	let { data }: { data: PageData } = $props();
</script>

<section>
	<h1>Health</h1>
	{#if data.ok}
		<p class="ok">flickr.test.echo round-trip succeeded.</p>
		<dl>
			<dt>method</dt>
			<dd>{data.method}</dd>
			<dt>api_key (echoed)</dt>
			<dd><code>{data.apiKeyEcho}</code></dd>
			<dt>hello (echoed)</dt>
			<dd>{data.helloEcho}</dd>
		</dl>
	{:else}
		<p class="err">Failed: {data.error}</p>
	{/if}
	<p><a href="/">← back</a></p>
</section>

<style>
	section {
		max-width: 48rem;
		margin: 4rem auto;
		padding: 0 1.5rem;
	}
	h1 {
		font-family: var(--font-sans);
		font-weight: 500;
		letter-spacing: -0.01em;
	}
	dl {
		display: grid;
		grid-template-columns: max-content 1fr;
		gap: 0.5rem 1.5rem;
		margin-top: 1.5rem;
	}
	dt {
		color: var(--fg-muted);
		font-family: var(--font-mono);
		font-size: 0.85rem;
	}
	dd {
		margin: 0;
		font-family: var(--font-mono);
		font-size: 0.85rem;
	}
	.ok {
		color: #6ec06e;
	}
	.err {
		color: #d96a6a;
	}
	code {
		font-family: var(--font-mono);
	}
</style>
