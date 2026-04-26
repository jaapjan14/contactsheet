<script lang="ts">
	import UserChrome from '$lib/components/UserChrome.svelte';
	import { decodeFlickrEntities, sanitizeFlickrHtml } from '$lib/flickr/text';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	// Bios contain Flickr-supplied HTML (mostly <a>, <br>). Decode entities first
	// so &quot; etc. become real characters, then sanitize to a safe whitelist.
	const description = $derived(
		sanitizeFlickrHtml(decodeFlickrEntities(data.user.description?._content ?? '')).trim()
	);
	const photoCount = $derived(data.user.photos?.count._content ?? '?');
	const totalViews = $derived(data.user.photos?.views?._content ?? null);
	const firstPhotoTaken = $derived(data.user.photos?.firstdatetaken?._content ?? null);
	const firstPhotoUploaded = $derived(data.user.photos?.firstdate?._content ?? null);
	const flickrProfileUrl = $derived(`https://www.flickr.com/people/${data.user.nsid}/`);
	const isPro = $derived(data.user.ispro === 1);

	function fmtUploadDate(epoch: string | null): string {
		if (!epoch) return '—';
		const ms = parseInt(epoch, 10) * 1000;
		if (!Number.isFinite(ms)) return '—';
		return new Date(ms).toLocaleDateString(undefined, {
			year: 'numeric',
			month: 'long',
			day: 'numeric'
		});
	}

	function fmtTakenDate(s: string | null): string {
		if (!s) return '—';
		// "2007-09-15 14:30:22"
		const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
		if (!m) return s;
		return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).toLocaleDateString(
			undefined,
			{
				year: 'numeric',
				month: 'long',
				day: 'numeric'
			}
		);
	}
</script>

<UserChrome
	user={data.user}
	userKey={data.userKey}
	activeTab="about"
	subtitle="{Number(photoCount).toLocaleString()} photos"
	isSelf={data.me?.nsid === data.user.nsid}
/>

<section class="about">
	{#if description}
		<!-- Sanitized HTML — only <a>+<br> survive; inline scripts blocked by CSP -->
		<div class="bio">{@html description}</div>
	{:else}
		<p class="empty">No bio.</p>
	{/if}

	<dl class="facts">
		<dt>Photos</dt>
		<dd>{Number(photoCount).toLocaleString()}</dd>

		{#if totalViews}
			<dt>Total views</dt>
			<dd>{Number(totalViews).toLocaleString()}</dd>
		{/if}

		{#if data.user.location}
			<dt>Location</dt>
			<dd>{data.user.location._content}</dd>
		{/if}

		{#if firstPhotoUploaded}
			<dt>First upload</dt>
			<dd>{fmtUploadDate(firstPhotoUploaded)}</dd>
		{/if}

		{#if firstPhotoTaken}
			<dt>Earliest photo taken</dt>
			<dd>{fmtTakenDate(firstPhotoTaken)}</dd>
		{/if}

		<dt>Pro account</dt>
		<dd>{isPro ? 'Yes' : 'No'}</dd>

		<dt>Flickr profile</dt>
		<dd><a href={flickrProfileUrl} target="_blank" rel="noopener noreferrer">{flickrProfileUrl}</a></dd>
	</dl>
</section>

<style>
	.about {
		max-width: 48rem;
		margin: 1.25rem auto 3rem;
		padding: 0 1.5rem;
	}
	.bio {
		font-family: var(--font-sans);
		color: #c8c8c8;
		line-height: 1.55;
		white-space: pre-wrap;
	}
	.bio :global(a) {
		color: var(--accent);
		word-break: break-word;
	}
	.empty {
		font-family: var(--font-mono);
		font-size: 0.85rem;
		color: var(--fg-muted);
		margin: 0 0 1.5rem;
	}
	.facts {
		display: grid;
		grid-template-columns: max-content 1fr;
		gap: 0.5rem 1.25rem;
		padding-top: 1rem;
		margin: 1.5rem 0 0;
		border-top: 1px solid var(--border);
	}
	.facts dt {
		font-family: var(--font-mono);
		font-size: 0.75rem;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--fg-muted);
		align-self: baseline;
	}
	.facts dd {
		margin: 0;
		font-family: var(--font-mono);
		font-size: 0.85rem;
		color: #c8c8c8;
		word-break: break-word;
	}
	@media (max-width: 640px) {
		.about {
			padding: 0 1rem;
		}
		.facts {
			grid-template-columns: 1fr;
			gap: 0.1rem 0;
		}
		.facts dt {
			margin-top: 0.6rem;
		}
		.facts dt:first-of-type {
			margin-top: 0;
		}
	}
</style>
