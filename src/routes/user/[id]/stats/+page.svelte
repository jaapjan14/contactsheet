<script lang="ts">
	import UserChrome from '$lib/components/UserChrome.svelte';
	import { photoUrl } from '$lib/flickr/urls';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	function fmt(n: string | number | undefined): string {
		if (n === undefined || n === null) return '—';
		return Number(n).toLocaleString();
	}

	const cards = $derived.by(() => {
		if (!data.totals) return [];
		const t = data.totals;
		return [
			{ label: 'Total views', value: t.total?.views },
			{ label: 'Photo views', value: t.photos?.views },
			{ label: 'Photostream views', value: t.photostream?.views },
			{ label: 'Album views', value: t.sets?.views ?? t.photoset?.views },
			{ label: 'Gallery views', value: t.galleries?.views },
			{ label: 'Collection views', value: t.collections?.views }
		].filter((c) => c.value !== undefined);
	});
</script>

<UserChrome
	user={data.user}
	userKey={data.userKey}
	activeTab="stats"
	subtitle="Stats"
	isSelf={data.me?.nsid === data.user.nsid}
/>

<section class="stats">
	{#if data.proRequired}
		<div class="notice">
			<h2>Flickr Pro required</h2>
			<p>
				Stats are only available to Flickr Pro accounts. Once you're Pro,
				ContactSheet will surface total views and your most-viewed photos here.
			</p>
		</div>
	{:else if data.statsError}
		<div class="notice err">
			<h2>Couldn't load stats</h2>
			<p>{data.statsError}</p>
		</div>
	{:else}
		{#if cards.length > 0}
			<div class="cards">
				{#each cards as c (c.label)}
					<div class="card">
						<dt>{c.label}</dt>
						<dd>{fmt(c.value)}</dd>
					</div>
				{/each}
			</div>
		{/if}

		{#if data.popular?.photo && data.popular.photo.length > 0}
			<h2>Most viewed</h2>
			<div class="grid">
				{#each data.popular.photo as p (p.id)}
					<a class="cell" href="/photo/{p.id}" title={p.title}>
						<img
							src={photoUrl(p, 'z')}
							alt={p.title}
							loading="lazy"
							style="view-transition-name: photo-{p.id};"
						/>
						{#if p.stats || p.count_views}
							<div class="overlay">
								{fmt(p.stats?.views ?? p.count_views)} views
							</div>
						{/if}
					</a>
				{/each}
			</div>
		{/if}
	{/if}
</section>

<style>
	.stats {
		max-width: 80rem;
		margin: 1.5rem auto;
		padding: 0 1.5rem;
	}
	.cards {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
		gap: 1rem;
		margin-bottom: 2rem;
	}
	.card {
		background: var(--bg-elev);
		border: 1px solid var(--border);
		border-radius: 4px;
		padding: 1rem;
	}
	.card dt {
		font-family: var(--font-mono);
		font-size: 0.7rem;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--fg-muted);
		margin-bottom: 0.4rem;
	}
	.card dd {
		font-family: var(--font-sans);
		font-size: 1.6rem;
		font-weight: 500;
		letter-spacing: -0.01em;
		margin: 0;
	}
	h2 {
		font-family: var(--font-sans);
		font-weight: 500;
		font-size: 1rem;
		letter-spacing: -0.005em;
		margin: 1.5rem 0 0.75rem;
		color: var(--fg);
	}
	.grid {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 2px;
	}
	@media (min-width: 600px) {
		.grid {
			grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
			gap: 4px;
		}
	}
	.cell {
		display: block;
		aspect-ratio: 1;
		overflow: hidden;
		background: var(--bg-elev);
		border-radius: 2px;
		position: relative;
	}
	.cell img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		display: block;
		transition: transform 0.3s ease;
	}
	.cell:hover img {
		transform: scale(1.04);
	}
	.overlay {
		position: absolute;
		bottom: 0.5rem;
		left: 0.5rem;
		font-family: var(--font-mono);
		font-size: 0.7rem;
		color: rgba(255, 255, 255, 0.85);
		background: rgba(0, 0, 0, 0.55);
		padding: 0.15rem 0.45rem;
		border-radius: 2px;
	}
	.notice {
		text-align: center;
		max-width: 32rem;
		margin: 4rem auto;
		font-family: var(--font-sans);
	}
	.notice h2 {
		margin: 0 0 0.6rem;
		font-size: 1.1rem;
	}
	.notice p {
		color: var(--fg-muted);
		font-size: 0.9rem;
		line-height: 1.55;
	}
	.notice.err {
		color: #d96a6a;
	}
</style>
