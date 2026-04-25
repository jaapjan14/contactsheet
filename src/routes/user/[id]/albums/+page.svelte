<script lang="ts">
	import UserChrome from '$lib/components/UserChrome.svelte';
	import { photoUrl } from '$lib/flickr/urls';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const subtitle = $derived(
		`${Number(data.albums.total).toLocaleString()} albums · ${
			data.user.photos?.count._content ?? '?'
		} photos`
	);
</script>

<UserChrome
	user={data.user}
	userKey={data.userKey}
	activeTab="albums"
	{subtitle}
	isSelf={data.me?.nsid === data.user.nsid}
/>

<div class="grid">
	{#each data.albums.photoset as album (album.id)}
		<a class="card" href="/album/{album.id}" title={album.title._content}>
			<div class="cover">
				<img
					src={photoUrl(
						{ id: album.primary, server: album.server, secret: album.secret },
						'z'
					)}
					alt={album.title._content}
					loading="lazy"
					style="view-transition-name: album-{album.id};"
				/>
			</div>
			<div class="info">
				<h3>{album.title._content || 'Untitled'}</h3>
				<p>{Number(album.photos).toLocaleString()} photos</p>
			</div>
		</a>
	{/each}
</div>

{#if data.albums.photoset.length === 0}
	<p class="empty">No public albums.</p>
{/if}

<style>
	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
		gap: 1.5rem;
		max-width: 80rem;
		margin: 1.5rem auto;
		padding: 0 1.5rem;
	}
	.card {
		display: block;
		color: inherit;
	}
	.card:hover {
		text-decoration: none;
	}
	.cover {
		aspect-ratio: 4 / 3;
		overflow: hidden;
		background: var(--bg-elev);
		border-radius: 3px;
		margin-bottom: 0.6rem;
	}
	.cover img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		display: block;
		transition: transform 0.3s ease;
	}
	.card:hover .cover img {
		transform: scale(1.03);
	}
	.info h3 {
		margin: 0 0 0.2rem;
		font-family: var(--font-sans);
		font-weight: 500;
		font-size: 1rem;
		letter-spacing: -0.005em;
		color: var(--fg);
	}
	.info p {
		margin: 0;
		font-family: var(--font-mono);
		font-size: 0.75rem;
		color: var(--fg-muted);
	}
	.empty {
		text-align: center;
		font-family: var(--font-mono);
		font-size: 0.85rem;
		color: var(--fg-muted);
		padding: 4rem 1.5rem;
	}
</style>
