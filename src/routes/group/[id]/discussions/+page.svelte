<script lang="ts" module>
	import type { Snapshot } from './$types';
	import type { FlickrDiscussTopic } from '$lib/server/flickr/types';

	interface SnapState {
		groupKey: string;
		topics: FlickrDiscussTopic[];
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
	import { goto } from '$app/navigation';
	import GroupChrome from '$lib/components/GroupChrome.svelte';
	import { decodeFlickrEntities } from '$lib/flickr/text';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	// --- new-topic compose state ---
	let composeOpen = $state(false);
	let newSubject = $state('');
	let newMessage = $state('');
	let posting = $state(false);
	let postError: string | null = $state(null);

	const restored = untrack(() =>
		snapHolder?.groupKey === data.groupKey ? snapHolder : null
	);

	let topics = $state<FlickrDiscussTopic[]>(
		untrack(() => restored?.topics ?? data.topics.topic)
	);
	let currentPage = $state(untrack(() => restored?.currentPage ?? data.topics.page));
	let totalPages = $state(untrack(() => restored?.totalPages ?? data.topics.pages));
	let loading = $state(false);
	let loadError: string | null = $state(null);
	let lastGroupKey = $state(untrack(() => data.groupKey));
	let sentinelEl: HTMLElement | null = $state(null);

	$effect(() => {
		if (data.groupKey !== lastGroupKey) {
			lastGroupKey = data.groupKey;
			topics = data.topics.topic;
			currentPage = data.topics.page;
			totalPages = data.topics.pages;
			loadError = null;
		}
		snapHolder = {
			groupKey: data.groupKey,
			topics,
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
				`/api/group/${encodeURIComponent(data.groupKey)}/discussions?page=${next}`
			);
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			const pageData = (await res.json()) as { topic: FlickrDiscussTopic[]; page: number };
			topics = [...topics, ...pageData.topic];
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
		else window.location.href = `/group/${data.groupKey}`;
	}

	async function errorFrom(res: Response): Promise<string> {
		let msg = `HTTP ${res.status}`;
		const ct = res.headers.get('content-type') ?? '';
		if (ct.includes('application/json')) {
			try {
				const body = (await res.json()) as { message?: string; error?: string };
				msg = body.message || body.error || msg;
			} catch {
				/* fall through */
			}
		} else if (res.status === 502 || res.status === 504) {
			msg = 'Flickr took too long — try again.';
		}
		return msg;
	}

	function cancelCompose() {
		composeOpen = false;
		newSubject = '';
		newMessage = '';
		postError = null;
	}

	async function postNewTopic(e: SubmitEvent) {
		e.preventDefault();
		const subj = newSubject.trim();
		const body = newMessage.trim();
		if (!subj || !body || posting) return;
		posting = true;
		postError = null;
		try {
			const res = await fetch(
				`/api/group/${encodeURIComponent(data.groupKey)}/discussions`,
				{
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ subject: subj, message: body })
				}
			);
			if (!res.ok) throw new Error(await errorFrom(res));
			const result = (await res.json()) as { topicId?: string };
			if (result.topicId) {
				goto(`/group/${data.groupKey}/discussions/${result.topicId}`);
			} else {
				// Fallback: reload the list so the new topic appears
				cancelCompose();
				window.location.reload();
			}
		} catch (err) {
			postError = (err as Error).message;
		} finally {
			posting = false;
		}
	}

	function formatRelativeDate(unixSeconds: string): string {
		const t = Number(unixSeconds) * 1000;
		if (!t) return '';
		const diffMs = Date.now() - t;
		const diffMin = Math.floor(diffMs / 60_000);
		if (diffMin < 1) return 'just now';
		if (diffMin < 60) return `${diffMin}m ago`;
		const diffHr = Math.floor(diffMin / 60);
		if (diffHr < 24) return `${diffHr}h ago`;
		const diffDay = Math.floor(diffHr / 24);
		if (diffDay < 30) return `${diffDay}d ago`;
		const diffMo = Math.floor(diffDay / 30);
		if (diffMo < 12) return `${diffMo}mo ago`;
		const diffYr = Math.floor(diffMo / 12);
		return `${diffYr}y ago`;
	}
</script>

<nav class="topnav">
	<button type="button" class="back" onclick={back}>← Back</button>
</nav>

<GroupChrome group={data.group} groupKey={data.groupKey} activeTab="discussions" />

{#if data.me}
	<div class="compose-bar">
		{#if !composeOpen}
			<button type="button" class="new-topic-btn" onclick={() => (composeOpen = true)}>
				+ New topic
			</button>
		{:else}
			<form class="new-topic-form" onsubmit={postNewTopic}>
				<label class="compose-label" for="new-topic-subject">Subject</label>
				<input
					id="new-topic-subject"
					type="text"
					class="compose-input"
					bind:value={newSubject}
					placeholder="Topic subject"
					autocomplete="off"
				/>
				<label class="compose-label" for="new-topic-message">Message</label>
				<textarea
					id="new-topic-message"
					class="compose-textarea"
					bind:value={newMessage}
					rows="6"
					placeholder="What's on your mind?"
				></textarea>
				<div class="compose-actions">
					<button
						type="submit"
						class="compose-btn primary"
						disabled={!newSubject.trim() || !newMessage.trim() || posting}
					>
						{posting ? 'posting…' : 'post topic'}
					</button>
					<button type="button" class="compose-btn" onclick={cancelCompose} disabled={posting}>
						cancel
					</button>
					{#if postError}<span class="post-error">{postError}</span>{/if}
				</div>
			</form>
		{/if}
	</div>
{/if}

{#if data.topicsError}
	<p class="empty">Can't read discussions for this group — {data.topicsError}.</p>
{:else if topics.length === 0}
	<p class="empty">No discussion topics in this group yet.</p>
{:else}
	<p class="meta-line">
		{Number(data.topics.total).toLocaleString()} {data.topics.total === 1 ? 'topic' : 'topics'}
	</p>
	<ul class="topic-list">
		{#each topics as t (t.id)}
			<li class="topic-row" class:sticky={t.is_sticky === 1} class:locked={t.is_locked === 1}>
				<a class="subject" href="/group/{data.groupKey}/discussions/{t.id}">
					{#if t.is_sticky === 1}<span class="badge sticky-badge" title="Sticky">📌</span>{/if}
					{#if t.is_locked === 1}<span class="badge locked-badge" title="Locked">🔒</span>{/if}
					{decodeFlickrEntities(t.subject)}
				</a>
				<div class="row-meta">
					<a
						class="author"
						href="/user/{t.author_path_alias || t.author}/photostream"
						onclick={(e) => e.stopPropagation()}
					>
						{t.authorname}
					</a>
					<span class="dot">·</span>
					<span class="counts">{Number(t.count_replies).toLocaleString()} {Number(t.count_replies) === 1 ? 'reply' : 'replies'}</span>
					<span class="dot">·</span>
					<span class="last-post" title="Last post {new Date(Number(t.datelastpost) * 1000).toLocaleString()}">
						last post {formatRelativeDate(t.datelastpost)}
					</span>
				</div>
			</li>
		{/each}
	</ul>

	{#if currentPage < totalPages}
		<div class="sentinel" bind:this={sentinelEl} aria-hidden="true">
			{#if loading}
				loading more…
			{:else if loadError}
				<span class="load-error">Failed to load more: {loadError}</span>
				<button type="button" class="retry" onclick={loadMore}>retry</button>
			{/if}
		</div>
	{:else}
		<div class="end">end · {topics.length.toLocaleString()} of {data.topics.total.toLocaleString()} loaded</div>
	{/if}
{/if}

<style>
	.topnav {
		max-width: 80rem;
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

	.compose-bar {
		max-width: 80rem;
		margin: 1rem auto 0;
		padding: 0 1.5rem;
	}
	.new-topic-btn {
		font-family: var(--font-mono);
		font-size: 0.8rem;
		padding: 0.45rem 0.95rem;
		background: var(--bg-elev);
		color: var(--accent);
		border: 1px solid var(--border);
		border-radius: 3px;
		cursor: pointer;
		transition: border-color 0.15s;
	}
	.new-topic-btn:hover {
		border-color: var(--accent);
	}
	.new-topic-form {
		display: flex;
		flex-direction: column;
		gap: 0.45rem;
		background: var(--bg-elev);
		border: 1px solid var(--border);
		border-radius: 4px;
		padding: 0.9rem 1rem;
	}
	.compose-label {
		font-family: var(--font-mono);
		font-size: 0.74rem;
		color: var(--fg-muted);
	}
	.compose-input,
	.compose-textarea {
		background: var(--bg);
		border: 1px solid var(--border);
		color: var(--fg);
		padding: 0.5rem 0.7rem;
		font-family: var(--font-sans);
		font-size: 0.92rem;
		border-radius: 3px;
		outline: none;
	}
	.compose-input:focus,
	.compose-textarea:focus {
		border-color: var(--accent);
	}
	.compose-textarea {
		min-height: 8rem;
		resize: vertical;
		line-height: 1.5;
	}
	.compose-actions {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-top: 0.3rem;
		flex-wrap: wrap;
	}
	.compose-btn {
		font-family: var(--font-mono);
		font-size: 0.78rem;
		padding: 0.4rem 0.85rem;
		background: var(--bg);
		color: var(--fg-muted);
		border: 1px solid var(--border);
		border-radius: 3px;
		cursor: pointer;
		transition: border-color 0.15s, color 0.15s;
	}
	.compose-btn:hover:not(:disabled) {
		color: var(--fg);
		border-color: var(--fg-muted);
	}
	.compose-btn.primary {
		color: var(--accent);
	}
	.compose-btn.primary:hover:not(:disabled) {
		border-color: var(--accent);
	}
	.compose-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
	.post-error {
		color: #ff7a3d;
		font-family: var(--font-mono);
		font-size: 0.74rem;
	}

	.meta-line {
		max-width: 80rem;
		margin: 1rem auto 0.5rem;
		padding: 0 1.5rem;
		color: var(--fg-muted);
		font-family: var(--font-mono);
		font-size: 0.8rem;
	}

	.empty {
		max-width: 80rem;
		margin: 2rem auto;
		padding: 0 1.5rem;
		color: var(--fg-muted);
		font-family: var(--font-sans);
	}

	.topic-list {
		max-width: 80rem;
		margin: 0 auto 2rem;
		padding: 0 1.5rem;
		list-style: none;
	}
	.topic-row {
		padding: 0.85rem 0;
		border-bottom: 1px solid var(--border);
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
	}
	.topic-row:last-child {
		border-bottom: none;
	}
	.topic-row.sticky {
		background: rgba(255, 122, 61, 0.03);
	}
	.topic-row.locked .subject {
		color: var(--fg-muted);
	}

	.subject {
		font-family: var(--font-sans);
		font-size: 1rem;
		color: var(--fg);
		font-weight: 500;
		text-decoration: none;
	}
	.subject:hover {
		color: var(--accent);
		text-decoration: none;
	}
	.badge {
		font-size: 0.75em;
		margin-right: 0.35rem;
		vertical-align: 0.05em;
	}

	.row-meta {
		display: flex;
		flex-wrap: wrap;
		gap: 0.35rem;
		font-family: var(--font-mono);
		font-size: 0.74rem;
		color: var(--fg-muted);
	}
	.author {
		color: var(--accent);
		text-decoration: none;
	}
	.author:hover {
		text-decoration: underline;
	}
	.dot {
		opacity: 0.5;
	}

	.sentinel {
		max-width: 80rem;
		margin: 1rem auto;
		padding: 0.5rem 1.5rem 1.5rem;
		text-align: center;
		color: var(--fg-muted);
		font-family: var(--font-mono);
		font-size: 0.8rem;
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
		max-width: 80rem;
		margin: 1rem auto 2rem;
		padding: 0.5rem 1.5rem;
		text-align: center;
		color: var(--fg-muted);
		font-family: var(--font-mono);
		font-size: 0.8rem;
	}

	@media (max-width: 640px) {
		.topnav {
			margin: 0.5rem auto 0;
			padding: 0 1rem;
		}
		.meta-line,
		.topic-list,
		.empty,
		.sentinel,
		.end {
			padding-left: 1rem;
			padding-right: 1rem;
		}
		.subject {
			font-size: 0.95rem;
		}
	}
</style>
