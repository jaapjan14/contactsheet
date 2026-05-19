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
	import { goto, invalidateAll } from '$app/navigation';
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

	// --- OP state (live editable subject/body) ---
	let liveSubject = $state(untrack(() => data.replies.topic.subject));
	let liveOpMessage = $state(untrack(() => data.replies.topic.message?._content ?? ''));

	// --- reply compose state ---
	let replyDraft = $state('');
	let replyPosting = $state(false);
	let replyError: string | null = $state(null);
	let replyTextareaEl: HTMLTextAreaElement | null = $state(null);

	// --- edit/delete reply state ---
	let editingReplyId: string | null = $state(null);
	let replyEditDraft = $state('');
	let replyEditSaving = $state(false);
	let replyEditError: string | null = $state(null);
	let deletingReplyId: string | null = $state(null);
	let replyDeleteError: string | null = $state(null);

	// --- edit/delete OP state ---
	let editingOp = $state(false);
	let opSubjectDraft = $state('');
	let opMessageDraft = $state('');
	let opEditSaving = $state(false);
	let opEditError: string | null = $state(null);
	let opDeleting = $state(false);
	let opDeleteError: string | null = $state(null);

	$effect(() => {
		if (data.topicId !== lastTopicId) {
			lastTopicId = data.topicId;
			replies = data.replies.reply;
			currentPage = data.replies.page;
			totalPages = data.replies.pages;
			loadError = null;
			liveSubject = data.replies.topic.subject;
			liveOpMessage = data.replies.topic.message?._content ?? '';
			// reset all per-topic transient state
			replyDraft = '';
			replyError = null;
			editingReplyId = null;
			replyEditError = null;
			deletingReplyId = null;
			replyDeleteError = null;
			editingOp = false;
			opEditError = null;
			opDeleteError = null;
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
		sanitizeFlickrHtml(decodeFlickrEntities(liveOpMessage)).trim()
	);
	function replyBodyHtml(r: FlickrDiscussReply): string {
		return sanitizeFlickrHtml(decodeFlickrEntities(r.message?._content ?? '')).trim();
	}

	const isLocked = $derived(topicHead.is_locked === 1);
	const canReply = $derived(
		!!data.me && !isLocked && topicHead.can_reply !== 0
	);
	const canEditOp = $derived(!!data.me && topicHead.can_edit === 1);
	const canDeleteOp = $derived(!!data.me && topicHead.can_delete === 1);

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

	// --- reply compose ---
	async function postReply(e: SubmitEvent) {
		e.preventDefault();
		const text = replyDraft.trim();
		if (!text || replyPosting) return;
		replyPosting = true;
		replyError = null;
		try {
			const res = await fetch(
				`/api/discuss/${encodeURIComponent(data.topicId)}/replies`,
				{
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ message: text, group_id: data.groupKey })
				}
			);
			if (!res.ok) throw new Error(await errorFrom(res));
			const result = (await res.json()) as { replyId?: string };
			const newReply: FlickrDiscussReply = {
				id: result.replyId || `tmp-${Date.now()}`,
				author: data.me?.nsid ?? '',
				authorname: data.me?.fullname || data.me?.username || 'you',
				datecreate: String(Math.floor(Date.now() / 1000)),
				message: { _content: text },
				can_edit: 1,
				can_delete: 1
			};
			replies = [...replies, newReply];
			replyDraft = '';
		} catch (err) {
			replyError = (err as Error).message;
		} finally {
			replyPosting = false;
		}
	}

	// --- edit reply ---
	function startEditReply(r: FlickrDiscussReply) {
		editingReplyId = r.id;
		replyEditDraft = r.message?._content ?? '';
		replyEditError = null;
	}
	function cancelEditReply() {
		editingReplyId = null;
		replyEditDraft = '';
		replyEditError = null;
	}
	async function saveEditReply(r: FlickrDiscussReply) {
		if (replyEditSaving) return;
		const text = replyEditDraft.trim();
		if (!text) return;
		replyEditSaving = true;
		replyEditError = null;
		try {
			const res = await fetch(
				`/api/discuss/${encodeURIComponent(data.topicId)}/replies/${encodeURIComponent(r.id)}`,
				{
					method: 'PATCH',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ message: text, group_id: data.groupKey })
				}
			);
			if (!res.ok) throw new Error(await errorFrom(res));
			replies = replies.map((x) =>
				x.id === r.id
					? { ...x, message: { _content: text }, lastedit: String(Math.floor(Date.now() / 1000)) }
					: x
			);
			editingReplyId = null;
			replyEditDraft = '';
		} catch (err) {
			replyEditError = (err as Error).message;
		} finally {
			replyEditSaving = false;
		}
	}

	// --- delete reply ---
	async function deleteReplyAction(r: FlickrDiscussReply) {
		if (deletingReplyId) return;
		if (typeof window !== 'undefined' && !window.confirm('Delete this reply?')) return;
		deletingReplyId = r.id;
		replyDeleteError = null;
		try {
			const res = await fetch(
				`/api/discuss/${encodeURIComponent(data.topicId)}/replies/${encodeURIComponent(r.id)}?group_id=${encodeURIComponent(data.groupKey)}`,
				{ method: 'DELETE' }
			);
			if (!res.ok) throw new Error(await errorFrom(res));
			replies = replies.filter((x) => x.id !== r.id);
		} catch (err) {
			replyDeleteError = (err as Error).message;
		} finally {
			deletingReplyId = null;
		}
	}

	// --- OP edit ---
	function startEditOp() {
		editingOp = true;
		opSubjectDraft = decodeFlickrEntities(topicHead.subject);
		opMessageDraft = liveOpMessage;
		opEditError = null;
	}
	function cancelEditOp() {
		editingOp = false;
		opSubjectDraft = '';
		opMessageDraft = '';
		opEditError = null;
	}
	async function saveEditOp() {
		if (opEditSaving) return;
		const subj = opSubjectDraft.trim();
		const body = opMessageDraft.trim();
		if (!subj || !body) return;
		opEditSaving = true;
		opEditError = null;
		try {
			const res = await fetch(`/api/discuss/${encodeURIComponent(data.topicId)}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ subject: subj, message: body, group_id: data.groupKey })
			});
			if (!res.ok) throw new Error(await errorFrom(res));
			liveSubject = subj;
			liveOpMessage = body;
			editingOp = false;
		} catch (err) {
			opEditError = (err as Error).message;
		} finally {
			opEditSaving = false;
		}
	}

	// --- OP delete ---
	async function deleteOpAction() {
		if (opDeleting) return;
		if (
			typeof window !== 'undefined' &&
			!window.confirm('Delete this entire topic? All replies will also be deleted.')
		)
			return;
		opDeleting = true;
		opDeleteError = null;
		try {
			const res = await fetch(
				`/api/discuss/${encodeURIComponent(data.topicId)}?group_id=${encodeURIComponent(data.groupKey)}`,
				{ method: 'DELETE' }
			);
			if (!res.ok) throw new Error(await errorFrom(res));
			// Topic gone — bounce back to the discussions list with fresh data
			await invalidateAll();
			goto(`/group/${data.groupKey}/discussions`);
		} catch (err) {
			opDeleteError = (err as Error).message;
		} finally {
			opDeleting = false;
		}
	}

	function canEditReply(r: FlickrDiscussReply): boolean {
		return !!data.me && r.can_edit === 1;
	}
	function canDeleteReply(r: FlickrDiscussReply): boolean {
		return !!data.me && r.can_delete === 1;
	}
</script>

<nav class="topnav">
	<button type="button" class="back" onclick={back}>← Back to discussions</button>
</nav>

<GroupChrome group={data.group} groupKey={data.groupKey} activeTab="discussions" />

<article class="topic">
	<header class="topic-head">
		{#if editingOp}
			<input
				type="text"
				class="op-subject-input"
				bind:value={opSubjectDraft}
				placeholder="Topic subject"
			/>
		{:else}
			<h1 class="subject">
				{#if topicHead.is_sticky === 1}<span class="badge" title="Sticky">📌</span>{/if}
				{#if isLocked}<span class="badge" title="Locked">🔒</span>{/if}
				{decodeFlickrEntities(liveSubject)}
				{#if canEditOp}
					<button
						type="button"
						class="post-btn inline"
						onclick={startEditOp}
						aria-label="Edit topic"
						title="Edit topic"
					>
						✎
					</button>
				{/if}
				{#if canDeleteOp}
					<button
						type="button"
						class="post-btn inline danger"
						onclick={deleteOpAction}
						disabled={opDeleting}
						aria-label="Delete topic"
						title="Delete topic"
					>
						{opDeleting ? '…' : '🗑'}
					</button>
				{/if}
			</h1>
		{/if}
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
		{#if opDeleteError}<p class="post-error">{opDeleteError}</p>{/if}
	</header>

	<div class="post op-post">
		{#if editingOp}
			<textarea
				class="post-edit-textarea"
				bind:value={opMessageDraft}
				rows="8"
				placeholder="Topic body"
			></textarea>
			<div class="post-edit-actions">
				<button
					type="button"
					class="post-btn primary"
					onclick={saveEditOp}
					disabled={opEditSaving || !opSubjectDraft.trim() || !opMessageDraft.trim()}
				>
					{opEditSaving ? 'saving…' : 'save'}
				</button>
				<button type="button" class="post-btn" onclick={cancelEditOp} disabled={opEditSaving}>
					cancel
				</button>
				{#if opEditError}<span class="post-error inline">{opEditError}</span>{/if}
			</div>
		{:else if opBodyHtml}
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
						<a class="author" href="/user/{r.author_path_alias || r.author}/photostream">
							<img
								class="author-icon"
								src={buddyIcon(r.author, r.iconserver, r.iconfarm)}
								alt=""
							/>
							{r.authorname}
						</a>
						<div class="reply-actions">
							<time class="reply-date">{formatDate(r.datecreate)}</time>
							{#if canEditReply(r) && editingReplyId !== r.id}
								<button
									type="button"
									class="post-btn inline"
									onclick={() => startEditReply(r)}
									aria-label="Edit reply"
									title="Edit reply"
								>
									✎
								</button>
							{/if}
							{#if canDeleteReply(r) && editingReplyId !== r.id}
								<button
									type="button"
									class="post-btn inline danger"
									onclick={() => deleteReplyAction(r)}
									disabled={deletingReplyId === r.id}
									aria-label="Delete reply"
									title="Delete reply"
								>
									{deletingReplyId === r.id ? '…' : '🗑'}
								</button>
							{/if}
						</div>
					</header>
					{#if editingReplyId === r.id}
						<textarea
							class="post-edit-textarea"
							bind:value={replyEditDraft}
							rows="5"
							placeholder="Edit reply"
						></textarea>
						<div class="post-edit-actions">
							<button
								type="button"
								class="post-btn primary"
								onclick={() => saveEditReply(r)}
								disabled={replyEditSaving || !replyEditDraft.trim()}
							>
								{replyEditSaving ? 'saving…' : 'save'}
							</button>
							<button
								type="button"
								class="post-btn"
								onclick={cancelEditReply}
								disabled={replyEditSaving}
							>
								cancel
							</button>
							{#if replyEditError}<span class="post-error inline">{replyEditError}</span>{/if}
						</div>
					{:else}
						<!-- eslint-disable-next-line svelte/no-at-html-tags -->
						<div class="post-body">{@html replyBodyHtml(r)}</div>
					{/if}
				</li>
			{/each}
		</ol>
	{/if}

	{#if replyDeleteError}
		<p class="post-error">{replyDeleteError}</p>
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

	{#if canReply}
		<form class="reply-compose" onsubmit={postReply}>
			<label class="reply-label" for="reply-textarea">
				Reply as {data.me?.fullname || data.me?.username}
			</label>
			<textarea
				id="reply-textarea"
				bind:this={replyTextareaEl}
				bind:value={replyDraft}
				rows="4"
				placeholder="Write a reply…"
			></textarea>
			<div class="reply-actions-row">
				<button
					type="submit"
					class="post-btn primary"
					disabled={!replyDraft.trim() || replyPosting}
				>
					{replyPosting ? 'posting…' : 'post reply'}
				</button>
				{#if replyError}<span class="post-error inline">{replyError}</span>{/if}
			</div>
		</form>
	{:else if isLocked}
		<p class="locked-note">🔒 This topic is locked — replies are disabled.</p>
	{:else if !data.me}
		<p class="signin-note">
			<a href="/auth/start">Sign in</a> to reply.
		</p>
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
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-wrap: wrap;
	}
	.op-subject-input {
		width: 100%;
		background: var(--bg-elev);
		border: 1px solid var(--border);
		color: var(--fg);
		padding: 0.5rem 0.7rem;
		font-family: var(--font-sans);
		font-size: 1.25rem;
		font-weight: 500;
		border-radius: 3px;
		outline: none;
		margin-bottom: 0.5rem;
	}
	.op-subject-input:focus {
		border-color: var(--accent);
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
	.reply-actions {
		display: flex;
		align-items: center;
		gap: 0.5rem;
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

	.post-edit-textarea {
		width: 100%;
		background: var(--bg);
		border: 1px solid var(--border);
		color: var(--fg);
		padding: 0.5rem 0.7rem;
		font-family: var(--font-sans);
		font-size: 0.92rem;
		line-height: 1.5;
		border-radius: 3px;
		outline: none;
		resize: vertical;
		min-height: 6rem;
	}
	.post-edit-textarea:focus {
		border-color: var(--accent);
	}
	.post-edit-actions {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-top: 0.4rem;
		flex-wrap: wrap;
	}

	.post-btn {
		font-family: var(--font-mono);
		font-size: 0.76rem;
		padding: 0.35rem 0.7rem;
		border-radius: 3px;
		background: var(--bg-elev);
		color: var(--fg-muted);
		border: 1px solid var(--border);
		cursor: pointer;
		white-space: nowrap;
		transition: border-color 0.15s, color 0.15s;
	}
	.post-btn:hover:not(:disabled) {
		color: var(--fg);
		border-color: var(--fg-muted);
	}
	.post-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
	.post-btn.primary {
		color: var(--accent);
	}
	.post-btn.primary:hover:not(:disabled) {
		border-color: var(--accent);
	}
	.post-btn.inline {
		font-size: 0.85rem;
		padding: 0.15rem 0.45rem;
		background: transparent;
		border-color: transparent;
		color: var(--fg-muted);
	}
	.post-btn.inline:hover:not(:disabled) {
		background: var(--bg-elev);
		border-color: var(--border);
		color: var(--fg);
	}
	.post-btn.danger:hover:not(:disabled) {
		color: #ff6b6b;
		border-color: #ff6b6b;
	}

	.post-error {
		color: #ff7a3d;
		font-family: var(--font-mono);
		font-size: 0.74rem;
		margin: 0.3rem 0 0;
	}
	.post-error.inline {
		margin: 0;
	}

	.reply-compose {
		margin-top: 2rem;
		padding-top: 1.25rem;
		border-top: 1px solid var(--border);
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	.reply-label {
		font-family: var(--font-mono);
		font-size: 0.78rem;
		color: var(--fg-muted);
	}
	.reply-compose textarea {
		width: 100%;
		background: var(--bg-elev);
		border: 1px solid var(--border);
		color: var(--fg);
		padding: 0.65rem 0.8rem;
		font-family: var(--font-sans);
		font-size: 0.95rem;
		line-height: 1.5;
		border-radius: 3px;
		outline: none;
		resize: vertical;
		min-height: 6rem;
	}
	.reply-compose textarea:focus {
		border-color: var(--accent);
	}
	.reply-actions-row {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		flex-wrap: wrap;
	}

	.locked-note,
	.signin-note {
		margin-top: 1.5rem;
		padding-top: 1.25rem;
		border-top: 1px solid var(--border);
		color: var(--fg-muted);
		font-family: var(--font-mono);
		font-size: 0.8rem;
		text-align: center;
	}
	.signin-note a {
		color: var(--accent);
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
		.reply-head {
			gap: 0.3rem;
		}
		.reply-compose textarea {
			font-size: 0.92rem;
		}
	}
</style>
