<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { goto } from '$app/navigation';
	import type { FlickrGroupInfo } from '$lib/server/flickr/types';

	let {
		group,
		groupKey,
		activeTab,
		poolCount
	}: {
		group: FlickrGroupInfo;
		groupKey: string;
		activeTab: 'photos' | 'discussions';
		poolCount?: number;
	} = $props();

	const groupIcon = $derived.by(() => {
		if (!group.iconserver || group.iconserver === '0') {
			return 'https://www.flickr.com/images/buddyicon.gif';
		}
		return `https://farm${group.iconfarm}.staticflickr.com/${group.iconserver}/buddyicons/${group.id}.jpg`;
	});

	// Membership state — lazy-loaded via /api/group/[id]/membership so the
	// SSR'd group page doesn't pay a people.getGroups round-trip on every
	// public hit. Only the authed-self gets the join/leave button.
	type MembershipState = { signedIn: boolean; member: boolean };
	let membership = $state<MembershipState | null>(null);
	let membershipPending = $state(false);
	let membershipError: string | null = $state(null);
	// Rules-gated groups: error 99 on join → server returns 409 → we open this
	// modal showing the group's rules; "I agree" re-POSTs with accept_rules=1.
	let rulesModalOpen = $state(false);
	let agreeing = $state(false);

	async function fetchMembership() {
		try {
			const res = await fetch(`/api/group/${encodeURIComponent(groupKey)}/membership`);
			if (!res.ok) return;
			membership = (await res.json()) as MembershipState;
		} catch {
			/* silent — button stays hidden if we can't determine */
		}
	}

	onMount(fetchMembership);

	let lastMembershipKey = untrack(() => groupKey);
	$effect(() => {
		if (groupKey === lastMembershipKey) return;
		lastMembershipKey = groupKey;
		membership = null;
		membershipError = null;
		fetchMembership();
	});

	async function membershipErrorFrom(res: Response): Promise<string> {
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

	async function toggleMembership() {
		if (!membership || membershipPending) return;
		const wantJoin = !membership.member;
		membershipPending = true;
		membershipError = null;
		if (!wantJoin) membership = { ...membership, member: false };
		try {
			const res = await fetch(`/api/group/${encodeURIComponent(groupKey)}/membership`, {
				method: wantJoin ? 'POST' : 'DELETE'
			});
			if (wantJoin && res.status === 409) {
				rulesModalOpen = true;
				return;
			}
			if (!res.ok) throw new Error(await membershipErrorFrom(res));
			const result = (await res.json()) as { member: boolean };
			membership = { signedIn: true, member: result.member };
		} catch (err) {
			if (!wantJoin) membership = { ...membership, member: true };
			membershipError = (err as Error).message;
		} finally {
			membershipPending = false;
		}
	}

	async function agreeAndJoin() {
		if (agreeing || !membership) return;
		agreeing = true;
		membershipError = null;
		try {
			const res = await fetch(`/api/group/${encodeURIComponent(groupKey)}/membership`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ acceptRules: true })
			});
			if (!res.ok) throw new Error(await membershipErrorFrom(res));
			membership = { signedIn: true, member: true };
			rulesModalOpen = false;
		} catch (err) {
			membershipError = (err as Error).message;
		} finally {
			agreeing = false;
		}
	}

	function cancelJoin() {
		rulesModalOpen = false;
	}

	interface Tab {
		slug: 'photos' | 'discussions';
		label: string;
		href: string;
	}

	const tabs: Tab[] = $derived([
		{ slug: 'photos', label: 'Photos', href: `/group/${groupKey}` },
		{ slug: 'discussions', label: 'Discussions', href: `/group/${groupKey}/discussions` }
	]);

	function navTab(e: Event) {
		const select = e.target as HTMLSelectElement;
		const slug = select.value;
		const restore = () => {
			select.value = activeTab;
		};
		if (!slug || slug === activeTab) {
			restore();
			return;
		}
		const tab = tabs.find((t) => t.slug === slug);
		if (tab) goto(tab.href);
		else restore();
	}

	const resolvedPoolCount = $derived(
		poolCount ?? Number(group.pool_count?._content ?? 0)
	);
</script>

<header class="group-header">
	<img class="icon" src={groupIcon} alt="" />
	<div class="who">
		<h1>{group.name._content}</h1>
		<p class="meta">
			{Number(group.members?._content ?? 0).toLocaleString()} members
			{#if resolvedPoolCount > 0} · {resolvedPoolCount.toLocaleString()} photos in pool{/if}
		</p>
		{#if membershipError}<p class="membership-error">{membershipError}</p>{/if}
	</div>
	{#if membership && membership.signedIn}
		<button
			type="button"
			class="member-btn"
			class:joined={membership.member}
			onclick={toggleMembership}
			disabled={membershipPending}
			title={membership.member ? 'Leave this group' : 'Join this group'}
		>
			{#if membershipPending}
				…
			{:else if membership.member}
				✓ Joined
			{:else}
				+ Join group
			{/if}
		</button>
	{/if}
</header>

<nav class="group-nav" aria-label="Group sections">
	{#each tabs as tab (tab.slug)}
		<a class="tab" class:active={tab.slug === activeTab} href={tab.href}>
			{tab.label}
		</a>
	{/each}
</nav>

<div class="group-nav-select">
	<select aria-label="Group section" value={activeTab} onchange={navTab}>
		{#each tabs as tab (tab.slug)}
			<option value={tab.slug} selected={tab.slug === activeTab}>{tab.label}</option>
		{/each}
	</select>
</div>

{#if rulesModalOpen}
	<div class="rules-backdrop" role="dialog" aria-modal="true" aria-labelledby="rules-title">
		<div class="rules-modal">
			<h2 id="rules-title">Group rules</h2>
			<p class="rules-intro">
				If you agree to these rules, you can join <strong>{group.name._content}</strong>.
			</p>
			<div class="rules-body">
				{#if group.rules?._content}
					<!-- eslint-disable-next-line svelte/no-at-html-tags -->
					{@html group.rules._content}
				{:else}
					<p>
						<em>
							This group did not publish rules text, but Flickr still requires you to
							acknowledge that rules exist before joining.
						</em>
					</p>
				{/if}
			</div>
			{#if membershipError}<p class="membership-error">{membershipError}</p>{/if}
			<div class="rules-actions">
				<button type="button" class="rules-cancel" onclick={cancelJoin} disabled={agreeing}>
					No, thanks
				</button>
				<button type="button" class="rules-agree" onclick={agreeAndJoin} disabled={agreeing}>
					{agreeing ? 'Joining…' : 'I agree'}
				</button>
			</div>
		</div>
	</div>
{/if}

<style>
	.group-header {
		display: flex;
		align-items: center;
		gap: 1rem;
		max-width: 80rem;
		margin: 0.75rem auto 0.5rem;
		padding: 0 1.5rem;
	}
	.icon {
		width: 64px;
		height: 64px;
		border-radius: 8px;
		background: var(--bg-elev);
	}
	.who {
		flex: 1;
		min-width: 0;
	}
	.who h1 {
		margin: 0;
		font-family: var(--font-sans);
		font-weight: 500;
		font-size: 1.5rem;
		letter-spacing: -0.01em;
	}
	.meta {
		margin: 0.25rem 0 0;
		color: var(--fg-muted);
		font-family: var(--font-mono);
		font-size: 0.8rem;
	}
	.member-btn {
		font-family: var(--font-mono);
		font-size: 0.78rem;
		padding: 0.4rem 0.85rem;
		border-radius: 3px;
		background: var(--bg-elev);
		color: var(--accent);
		border: 1px solid var(--border);
		cursor: pointer;
		white-space: nowrap;
		transition: border-color 0.15s, color 0.15s;
	}
	.member-btn:hover {
		border-color: var(--accent);
	}
	.member-btn.joined {
		color: #6cd58a;
		border-color: #2c5a3a;
		background: rgba(108, 213, 138, 0.06);
	}
	.member-btn.joined:hover {
		border-color: #6cd58a;
	}
	.member-btn:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}
	.membership-error {
		margin: 0.3rem 0 0;
		color: #ff7a3d;
		font-family: var(--font-mono);
		font-size: 0.72rem;
	}

	.group-nav {
		display: flex;
		gap: 1.5rem;
		max-width: 80rem;
		margin: 0 auto;
		padding: 0 1.5rem;
		border-bottom: 1px solid var(--border);
		overflow-x: auto;
		scrollbar-width: none;
	}
	.group-nav::-webkit-scrollbar {
		display: none;
	}
	.tab {
		padding: 0.75rem 0;
		font-family: var(--font-sans);
		font-size: 0.95rem;
		color: var(--fg-muted);
		border-bottom: 2px solid transparent;
		margin-bottom: -1px;
		flex-shrink: 0;
		white-space: nowrap;
	}
	.tab.active {
		color: var(--fg);
		border-bottom-color: var(--accent);
	}
	.tab:hover {
		color: var(--fg);
		text-decoration: none;
	}
	.group-nav-select {
		display: none;
	}

	.rules-backdrop {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.7);
		z-index: 100;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 1rem;
	}
	.rules-modal {
		background: var(--bg-elev);
		border: 1px solid var(--border);
		border-radius: 6px;
		padding: 1.25rem 1.5rem 1.4rem;
		max-width: 36rem;
		width: 100%;
		max-height: 80vh;
		display: flex;
		flex-direction: column;
		gap: 0.85rem;
	}
	.rules-modal h2 {
		margin: 0;
		font-family: var(--font-sans);
		font-weight: 500;
		font-size: 1.1rem;
	}
	.rules-intro {
		margin: 0;
		font-family: var(--font-sans);
		font-size: 0.85rem;
		color: var(--fg-muted);
	}
	.rules-body {
		flex: 1;
		overflow-y: auto;
		font-family: var(--font-sans);
		font-size: 0.9rem;
		line-height: 1.5;
		white-space: pre-wrap;
		color: var(--fg);
	}
	.rules-actions {
		display: flex;
		justify-content: flex-end;
		gap: 0.5rem;
	}
	.rules-cancel,
	.rules-agree {
		font-family: var(--font-mono);
		font-size: 0.78rem;
		padding: 0.45rem 0.9rem;
		border-radius: 3px;
		cursor: pointer;
		border: 1px solid var(--border);
	}
	.rules-cancel {
		background: transparent;
		color: var(--fg-muted);
	}
	.rules-cancel:hover {
		color: var(--fg);
	}
	.rules-agree {
		background: var(--bg);
		color: var(--accent);
	}
	.rules-agree:hover {
		border-color: var(--accent);
	}
	.rules-cancel:disabled,
	.rules-agree:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	@media (max-width: 640px) {
		.group-header {
			padding: 0 1rem;
			gap: 0.65rem;
		}
		.icon {
			width: 40px;
			height: 40px;
		}
		.who h1 {
			font-size: 1.05rem;
		}
		.meta {
			font-size: 0.72rem;
			margin-top: 0.1rem;
		}
		.member-btn {
			font-size: 0.72rem;
			padding: 0.35rem 0.7rem;
		}
		.group-nav {
			display: none;
		}
		.group-nav-select {
			display: flex;
			max-width: 80rem;
			margin: 0 auto;
			padding: 0.4rem 1rem 0.6rem;
			border-bottom: 1px solid var(--border);
		}
		.group-nav-select select {
			flex: 1;
			background: var(--bg-elev);
			border: 1px solid var(--border);
			color: var(--fg);
			padding: 0.5rem 0.7rem;
			padding-right: 2rem;
			font-family: var(--font-sans);
			font-size: 0.9rem;
			border-radius: 3px;
			outline: none;
			appearance: none;
			-webkit-appearance: none;
			cursor: pointer;
			background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 8'><path fill='%23888' d='M1 1l5 5 5-5'/></svg>");
			background-repeat: no-repeat;
			background-position: right 0.7rem center;
			background-size: 0.7rem;
		}
		.group-nav-select select:focus {
			border-color: var(--accent);
		}
	}
</style>
