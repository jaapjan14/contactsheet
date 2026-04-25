import adapter from '@sveltejs/adapter-node';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	compilerOptions: {
		// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
		runes: ({ filename }) => (filename.split(/[/\\]/).includes('node_modules') ? undefined : true)
	},
	kit: {
		adapter: adapter(),
		csp: {
			// `auto` picks hashes for prerendered pages and per-request nonces for dynamic ones.
			mode: 'auto',
			directives: {
				'default-src': ['self'],
				// SvelteKit injects its hydration scripts inline; mode:auto adds the nonce/hash
				// automatically. No third-party scripts; no `unsafe-inline` allowed.
				'script-src': ['self'],
				// `unsafe-inline` is required for the `style="view-transition-name: photo-{id}"`
				// attributes that drive the lightbox morph. Photo IDs are numeric Flickr IDs,
				// so there's no path for user-controlled content to reach a style attribute.
				'style-src': ['self', 'unsafe-inline', 'https://fonts.googleapis.com'],
				'font-src': ['self', 'https://fonts.gstatic.com'],
				// Flickr serves all photo sizes from *.staticflickr.com; buddy icons live on the
				// per-farm static hosts and the main site origin. `data:` covers the SVG favicon.
				'img-src': ['self', 'data:', 'https://*.staticflickr.com', 'https://www.flickr.com'],
				// All Flickr API calls are server-to-server. The browser only talks to our own
				// origin (which proxies + signs the requests).
				'connect-src': ['self'],
				// No frames, no nested browsing contexts.
				'frame-ancestors': ['none'],
				'base-uri': ['self'],
				// Form posts and OAuth redirects go to our origin and to flickr.com authorize.
				'form-action': ['self', 'https://www.flickr.com'],
				'object-src': ['none']
			}
		}
	}
};

export default config;
