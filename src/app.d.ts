// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces

declare global {
	namespace App {
		// interface Error {}
		// interface Locals {}
		// interface PageData {}
		interface PageState {
			// Set by openPhoto() via pushState — when present, the layout
			// renders <PhotoOverlay> over whatever grid the user came from.
			// State only holds the photoId (pushState state must be
			// JSON-serializable, so we can't pass the load result — it carries
			// streamed Promises). The overlay does its own preloadData() which
			// reuses any in-flight hover-preload via SvelteKit's preload cache.
			photoOverlay?: { photoId: string };
		}
		// interface Platform {}
	}
}

export {};
