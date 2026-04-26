<script lang="ts">
	import type { PageData, ActionData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
</script>

<svelte:head>
	<title>Sign in · ContactSheet</title>
</svelte:head>

<section>
	<h1>ContactSheet</h1>
	<p class="lead">A better way to look at Flickr.</p>

	<form method="POST" autocomplete="on">
		<!-- svelte-ignore a11y_autofocus -->
		<input
			type="password"
			name="password"
			placeholder="Password"
			autocomplete="current-password"
			autofocus
			required
		/>
		<input type="hidden" name="next" value={data.next} />
		<button type="submit">Enter</button>
		{#if form?.error}
			<p class="err">{form.error}</p>
		{/if}
	</form>
</section>

<style>
	section {
		max-width: 24rem;
		margin: 6rem auto;
		padding: 0 1.5rem;
	}
	h1 {
		font-family: var(--font-sans);
		font-weight: 500;
		font-size: 2.25rem;
		letter-spacing: -0.02em;
		margin: 0 0 0.5rem;
	}
	.lead {
		color: var(--fg-muted);
		font-family: var(--font-mono);
		font-size: 0.85rem;
		margin: 0 0 2rem;
	}
	form {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	input[type='password'] {
		background: var(--bg-elev);
		border: 1px solid var(--border);
		color: var(--fg);
		padding: 0.7rem 0.9rem;
		font-family: var(--font-mono);
		font-size: 0.95rem;
		border-radius: 3px;
		outline: none;
	}
	input[type='password']:focus {
		border-color: var(--accent);
	}
	button {
		background: var(--accent);
		color: #111;
		border: none;
		padding: 0.7rem 1.2rem;
		font-family: var(--font-mono);
		font-size: 0.95rem;
		font-weight: 500;
		border-radius: 3px;
		cursor: pointer;
	}
	button:hover {
		filter: brightness(1.1);
	}
	.err {
		margin: 0.5rem 0 0;
		color: #d96a6a;
		font-family: var(--font-mono);
		font-size: 0.85rem;
	}
</style>
