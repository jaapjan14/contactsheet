<script lang="ts" module>
	import type { Snapshot } from './$types';
	import type { FlickrDiscussReply } from '$lib/server/flickr/types';

	interface SnapState {
		topicId: string;
		replies: FlickrDiscussReply[];
		currentPage: number;
		totalPages: number;
	}
	let snapHolder: SnapState | null = null;
	export const snapshot: Snapshot<SnapState | null> = {
		capture: () => snapHolder,
		restore: (v) => {
			snapHolder = v;
		}
	};
</script>

<script lang="ts">
	import { untrack } from 'svelte';
	import GroupChrome from '$lib/components/GroupChrome.svelte';
	import { decodeFlickrEntities, sanitizeFlickrHtml } from '$lib/flickr/text';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const restored = untrack(() =>
		snapHolder?.topicId === data.topicId ? snapHolder : null
	);

	let replies = $state<FlickrDiscussReply[]>(
		untrack(() => restored?.replies ?? data.replies.reply)
	);
	let currentPage = $state(untrack(() => restored?.currentPage ?? data.replies.page));
	let totalPages = $state(untrack(() => restored?.totalPages ?? data.replies.pages));
	let loading = $state(false);
	let loadError: string | null = $state(null);
	let lastTopicId = $state(untrack(() => data.topicId));
	let sentinelEl: HTMLElement | null = $state(null);

	$effect(() => {
		if (data.topicId !== lastTopicId) {
			lastTopicId = data.topicId;
			replies = data.replies.reply;
			currentPage = data.replies.page;
			totalPages = data.replies.pages;
			loadError = null;
		}
		snapHolder = {
			topicId: data.topicId,
			replies,
			currentPage,
			totalPages
		};
	});

	async function loadMore() {
		if (loading || currentPage >= totalPages) return;
		loading = true;
		loadError = null;
		try {
			const next = currentPage + 1;
			const res = await fetch(
				`/api/discuss/${encodeURIComponent(data.topicId)}/replies?page=${next}&group_id=${encodeURIComponent(data.groupKey)}`
			);
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			const pageData = (await res.json()) as { reply: FlickrDiscussReply[]; page: number };
			replies = [...replies, ...pageData.reply];
			currentPage = pageData.page;
		} catch (err) {
			loadError = (err as Error).message;
		} finally {
			loading = false;
		}
	}

	$effect(() => {
		if (!sentinelEl) return;
		const observer = new IntersectionObserver(
			(entries) => {
				if (entries[0].isIntersecting) loadMore();
			},
			{ rootMargin: '600px 0px' }
		);
		observer.observe(sentinelEl);
		return () => observer.disconnect();
	});

	function back() {
		if (typeof window === 'undefined') return;
		const sameOrigin =
			document.referrer && new URL(document.referrer).origin === window.location.origin;
		if (sameOrigin && window.history.length > 1) window.history.back();
		else window.location.href = `/group/${data.groupKey}/discussions`;
	}

	function buddyIcon(
		nsid: string,
		iconserver?: string,
		iconfarm?: number
	): string {
		if (!iconserver || iconserver === '0') {
			return 'https://www.flickr.com/images/buddyicon.gif';
		}
		return `https://farm${iconfarm}.staticflickr.com/${iconserver}/buddyicons/${nsid}.jpg`;
	}

	function formatDate(unixSeconds: string): string {
		const t = Number(unixSeconds) * 1000;
		if (!t) return '';
		const d = new Date(t);
		return d.toLocaleString(undefined, {
			year: 'numeric',
			month: 'short',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	const topicHead = $derived(data.replies.topic);
	const opBodyHtml = $derived(
		sanitizeFlickrHtml(decodeFlickrEntities(topicHead.message?._content ?? '')).trim()
	);

	function replyBodyHtml(r: FlickrDiscussReply): string {
		return sanitizeFlickrHtml(decodeFlickrEntities(r.message?._content ?? '')).trim();
	}
</script>

<nav class="topnav">
	<button type="button" class="back" onclick={back}>← Back to discussions</button>
</nav>

<GroupChrome group={data.group} groupKey={data.groupKey} activeTab="discussions" />

<article class="topic">
	<header class="topic-head">
		<h1 class="subject">
			{#if topicHead.is_sticky === 1}<span class="badge" title="Sticky">📌</span>{/if}
			{#if topicHead.is_locked === 1}<span class="badge" title="Locked">🔒</span>{/if}
			{decodeFlickrEntities(topicHead.subject)}
		</h1>
		<p class="topic-meta">
			started by
			<a class="author" href="/user/{topicHead.author_path_alias || topicHead.author}/photostream">
				<img
					class="author-icon"
					src={buddyIcon(topicHead.author, topicHead.author_iconserver, topicHead.author_iconfarm)}
					alt=""
				/>
				{topicHead.authorname}
			</a>
			·
			<time>{formatDate(topicHead.datecreate)}</time>
			·
			{Number(data.replies.total).toLocaleString()} {data.replies.total === 1 ? 'reply' : 'replies'}
		</p>
	</header>

	<div class="post op-post">
		{#if opBodyHtml}
			<!-- eslint-disable-next-line svelte/no-at-html-tags -->
			<div class="post-body">{@html opBodyHtml}</div>
		{:else}
			<div class="post-body empty"><em>(no post body)</em></div>
		{/if}
	</div>

	{#if replies.length > 0}
		<ol class="reply-list">
			{#each replies as r (r.id)}
				<li class="reply-row">
					<header class="reply-head">
						<a
							class="author"
							href="/user/{r.author_path_alias || r.author}/photostream"
						>
							<img
								class="author-icon"
								src={buddyIcon(r.author, r.iconserver, r.iconfarm)}
								alt=""
							/>
							{r.authorname}
						</a>
						<time class="reply-date">{formatDate(r.datecreate)}</time>
					</header>
					<!-- eslint-disable-next-line svelte/no-at-html-tags -->
					<div class="post-body">{@html replyBodyHtml(r)}</div>
				</li>
			{/each}
		</ol>
	{/if}

	{#if currentPage < totalPages}
		<div class="sentinel" bind:this={sentinelEl} aria-hidden="true">
			{#if loading}
				loading more replies…
			{:else if loadError}
				<span class="load-error">Failed to load: {loadError}</span>
				<button type="button" class="retry" onclick={loadMore}>retry</button>
			{/if}
		</div>
	{:else if replies.length > 0}
		<div class="end">end of thread · {replies.length.toLocaleString()} of {data.replies.total.toLocaleString()} loaded</div>
	{:else}
		<p class="empty">No replies yet.</p>
	{/if}
</article>

<style>
	.topnav {
		max-width: 60rem;
		margin: 1rem auto 0;
		padding: 0 1.5rem;
	}
	.back {
		background: var(--bg-elev);
		border: 1px solid var(--border);
		color: var(--fg);
		font-family: var(--font-mono);
		font-size: 0.78rem;
		padding: 0.4rem 0.85rem;
		border-radius: 3px;
		cursor: pointer;
	}
	.back:hover {
		border-color: var(--accent);
		color: var(--accent);
	}

	.topic {
		max-width: 60rem;
		margin: 1rem auto 3rem;
		padding: 0 1.5rem;
	}
	.topic-head {
		margin-bottom: 1.25rem;
		padding-bottom: 0.75rem;
		border-bottom: 1px solid var(--border);
	}
	.subject {
		margin: 0 0 0.4rem;
		font-family: var(--font-sans);
		font-weight: 500;
		font-size: 1.4rem;
		letter-spacing: -0.01em;
	}
	.badge {
		font-size: 0.7em;
		margin-right: 0.3rem;
		vertical-align: 0.1em;
	}
	.topic-meta {
		margin: 0;
		color: var(--fg-muted);
		font-family: var(--font-mono);
		font-size: 0.78rem;
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
		align-items: center;
	}

	.post {
		padding: 0.5rem 0;
	}
	.op-post {
		padding-bottom: 1.5rem;
		border-bottom: 1px solid var(--border);
		margin-bottom: 1rem;
	}
	.post-body {
		font-family: var(--font-sans);
		font-size: 0.95rem;
		line-height: 1.55;
		color: var(--fg);
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}
	.post-body.empty {
		color: var(--fg-muted);
	}
	.post-body :global(a) {
		color: var(--accent);
	}
	.post-body :global(a:hover) {
		text-decoration: underline;
	}

	.reply-list {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.reply-row {
		padding: 1rem 0;
		border-bottom: 1px solid var(--border);
	}
	.reply-row:last-child {
		border-bottom: none;
	}
	.reply-head {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 0.5rem;
		margin-bottom: 0.4rem;
		flex-wrap: wrap;
	}
	.author {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		color: var(--accent);
		text-decoration: none;
		font-family: var(--font-mono);
		font-size: 0.82rem;
	}
	.author:hover {
		text-decoration: underline;
	}
	.author-icon {
		width: 22px;
		height: 22px;
		border-radius: 50%;
		background: var(--bg-elev);
	}
	.reply-date {
		color: var(--fg-muted);
		font-family: var(--font-mono);
		font-size: 0.72rem;
	}

	.sentinel {
		margin: 1rem 0;
		text-align: center;
		color: var(--fg-muted);
		font-family: var(--font-mono);
		font-size: 0.78rem;
	}
	.load-error {
		color: #ff7a3d;
	}
	.retry {
		margin-left: 0.5rem;
		background: var(--bg-elev);
		border: 1px solid var(--border);
		color: var(--fg);
		font-family: var(--font-mono);
		font-size: 0.75rem;
		padding: 0.25rem 0.6rem;
		border-radius: 3px;
		cursor: pointer;
	}
	.end {
		margin: 1rem 0 0;
		text-align: center;
		color: var(--fg-muted);
		font-family: var(--font-mono);
		font-size: 0.78rem;
	}
	.empty {
		margin: 1rem 0 0;
		text-align: center;
		color: var(--fg-muted);
		font-family: var(--font-sans);
	}

	@media (max-width: 640px) {
		.topnav,
		.topic {
			padding-left: 1rem;
			padding-right: 1rem;
		}
		.subject {
			font-size: 1.15rem;
		}
		.post-body {
			font-size: 0.92rem;
		}
	}
</style>
