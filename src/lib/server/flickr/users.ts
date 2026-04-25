import { flickr } from './client';
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
 * Resolve a Flickr screen name, path-alias, or NSID to a stable NSID.
 * Tries lookupUser first (path-alias URLs), then findByUsername.
 * Cached in SQLite for 30 days.
 */
export async function resolveUserId(input: string): Promise<string> {
	const trimmed = input.trim();
	if (NSID_RE.test(trimmed)) return trimmed;

	return wrap(key('resolveUserId', { input: trimmed }), TTL, async () => {
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
