// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
import type { PhotoViewData } from '$lib/components/PhotoView.svelte';

declare global {
	namespace App {
		// interface Error {}
		// interface Locals {}
		// interface PageData {}
		interface PageState {
			// Set by openPhoto() via pushState — when present, the layout
			// renders <PhotoOverlay> over whatever grid the user came from.
			photoOverlay?: { data: PhotoViewData };
		}
		// interface Platform {}
	}
}

export {};
