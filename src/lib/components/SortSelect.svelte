<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { SORTS, sortCookieName, type SortTab } from '$lib/sort';

	let { tab, value }: { tab: SortTab; value: string } = $props();

	const options = $derived(SORTS[tab].options);

	function change(e: Event) {
		const next = (e.currentTarget as HTMLSelectElement).value;
		// Remember the choice for this tab on every user/group, then reload the
		// grid in the new order. The server load reads the cookie when there's
		// no ?sort= in the URL.
		document.cookie = `${sortCookieName(tab)}=${next}; path=/; max-age=31536000; samesite=lax`;
		const url = new URL(page.url);
		url.searchParams.set('sort', next);
		goto(`${url.pathname}${url.search}`);
	}
</script>

<label class="sort">
	<span class="sr-only">Sort</span>
	<select {value} onchange={change} aria-label="Sort order">
		{#each options as o (o.value)}
			<option value={o.value}>{o.label}</option>
		{/each}
	</select>
</label>

<style>
	.sort {
		display: inline-flex;
		flex-shrink: 0;
	}
	select {
		background: var(--bg-elev);
		border: 1px solid var(--border);
		color: var(--fg);
		height: 2.1rem;
		padding: 0 0.6rem;
		font-family: var(--font-mono);
		font-size: 0.8rem;
		border-radius: 3px;
		outline: none;
		cursor: pointer;
	}
	select:hover,
	select:focus {
		border-color: var(--accent);
	}
	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
		white-space: nowrap;
	}
</style>
