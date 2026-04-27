<script lang="ts">
	import PhotoView from '$lib/components/PhotoView.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<PhotoView {data} />
