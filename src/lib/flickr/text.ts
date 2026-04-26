/**
 * Flickr returns several text fields (group names, photo titles, descriptions)
 * with HTML entities pre-encoded — e.g. `&quot;SEASCAPE&quot;` instead of
 * `"SEASCAPE"`. Svelte's `{}` text interpolation then HTML-escapes the leading
 * `&`, producing the visible double-encoded artifact `&amp;quot;`.
 *
 * Decode common entities so Svelte can do its own correct escaping pass on top.
 * This is text-only — we never feed the result into `{@html ...}`.
 */
export function decodeFlickrEntities(s: string | null | undefined): string {
	if (!s) return '';
	return s
		.replace(/&quot;/g, '"')
		.replace(/&apos;/g, "'")
		.replace(/&#0?39;/g, "'")
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&amp;/g, '&');
}

/**
 * Sanitize Flickr-supplied HTML (bios, descriptions). Whitelists `<a>` and
 * `<br>` only, drops every other tag, requires anchor hrefs to be
 * http/https/mailto, strips event-handler attributes, and adds rel/target
 * to outbound links. Combined with our `script-src 'self'` CSP — which blocks
 * inline event handlers and remote scripts — this is safe to feed into
 * `{@html ...}` for the small amount of formatting Flickr permits.
 */
export function sanitizeFlickrHtml(s: string | null | undefined): string {
	if (!s) return '';
	let out = s
		// Drop entire <script>/<style> blocks (paranoia; CSP blocks them anyway)
		.replace(/<\s*(script|style)\b[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
		// Strip on*= event handlers wherever they appear
		.replace(/\s+on\w+\s*=\s*"[^"]*"/gi, '')
		.replace(/\s+on\w+\s*=\s*'[^']*'/gi, '')
		.replace(/\s+on\w+\s*=\s*[^\s>]+/gi, '');

	// Rebuild <a> tags with sanitized href
	out = out.replace(
		/<a\b[^>]*?href\s*=\s*"([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi,
		(_m, href: string, text: string) => {
			const safe = /^https?:\/\//i.test(href) || /^mailto:/i.test(href);
			if (!safe) return text; // strip the anchor entirely
			const escapedHref = href.replace(/"/g, '&quot;');
			return `<a href="${escapedHref}" target="_blank" rel="noopener noreferrer">${text}</a>`;
		}
	);

	// Strip every tag except whitelisted ones
	out = out.replace(/<(?!\/?(a|br)\b)[^>]*>/gi, '');

	return out;
}
