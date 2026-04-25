import { flickr } from './client';

const nsidCache = new Map<string, string>();

const NSID_RE = /^\d+@N\d+$/;

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
 */
export async function resolveUserId(input: string): Promise<string> {
	const trimmed = input.trim();
	if (NSID_RE.test(trimmed)) return trimmed;

	const cached = nsidCache.get(trimmed);
	if (cached) return cached;

	try {
		const res = await flickr<LookupUserResponse>({
			method: 'flickr.urls.lookupUser',
			params: { url: `https://www.flickr.com/photos/${trimmed}/` }
		});
		nsidCache.set(trimmed, res.user.id);
		return res.user.id;
	} catch {
		// fall through
	}

	const res = await flickr<FindByUsernameResponse>({
		method: 'flickr.people.findByUsername',
		params: { username: trimmed }
	});
	const id = res.user.nsid || res.user.id;
	nsidCache.set(trimmed, id);
	return id;
}
