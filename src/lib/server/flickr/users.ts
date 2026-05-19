import { flickr } from './client';
import { authSig } from './authenticated';
import { wrap, key } from '$lib/server/cache';

const NSID_RE = /^\d+@N\d+$/;
const TTL = 30 * 24 * 60 * 60; // 30 days — path-aliases are very stable

interface LookupUserResponse {
	stat: string;
	user: { id: string; username: { _content: string } };
}

interface FindByUsernameResponse {
	stat: string;
	user: { id: string; nsid: string; username: { _content: string } };
}

/**
 * Resolve a Flickr screen name, path-alias, or NSID to a stable NSID. Tries
 * `urls.lookupUser` (path-alias URL) first, then `people.findByUsername`
 * (login screen-name). Both are documented public endpoints.
 *
 * Cached in SQLite for 30 days, keyed by input + auth-sig.
 *
 * **Display names with spaces are not resolvable** via the public API —
 * Flickr's `flickr.people.search` exists but is restricted to partner API
 * keys (error 122 "Not a valid API key" for our consumer key). The home
 * form's hint text directs the user to paste the Flickr URL when they want
 * to look up someone by display name, and `/user/[id]/+error.svelte`
 * surfaces the same guidance when a bare-name path 404s.
 */
export async function resolveUserId(input: string): Promise<string> {
	const trimmed = input.trim();
	if (NSID_RE.test(trimmed)) return trimmed;

	const sig = await authSig();
	return wrap(key('resolveUserId', { input: trimmed, sig }), TTL, async () => {
		try {
			const res = await flickr<LookupUserResponse>({
				method: 'flickr.urls.lookupUser',
				params: { url: `https://www.flickr.com/photos/${trimmed}/` }
			});
			return res.user.id;
		} catch {
			// fall through
		}

		const res = await flickr<FindByUsernameResponse>({
			method: 'flickr.people.findByUsername',
			params: { username: trimmed }
		});
		return res.user.nsid || res.user.id;
	});
}
