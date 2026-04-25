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
