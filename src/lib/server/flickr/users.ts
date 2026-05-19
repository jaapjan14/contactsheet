import { flickr, FlickrError } from './client';
import { authSig, flickrMaybeSigned } from './authenticated';
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

// `flickr.people.search` is the (signed-only) endpoint behind Flickr's
// site-wide People-search tab. It matches by display name, so it fills the
// gap that `findByUsername` (screen-name only) leaves. Response shape isn't
// well-documented; we accept both `people.person[]` and a singular
// `people.person` and pluck `nsid` defensively.
interface PeopleSearchResponse {
	stat: string;
	people?: {
		page?: number | string;
		pages?: number | string;
		perpage?: number | string;
		total?: number | string;
		person?:
			| Array<{ nsid?: string; id?: string; username?: { _content?: string } | string }>
			| { nsid?: string; id?: string; username?: { _content?: string } | string };
	};
}

/**
 * Resolve a Flickr screen name, path-alias, NSID, or **display name** to a
 * stable NSID. Three attempts in order:
 *   1. `urls.lookupUser` — works when input is a path-alias whose photos page
 *      Flickr has indexed (most established accounts).
 *   2. `people.findByUsername` — works when input is the user's login
 *      screen-name (also catches some path-aliases that lookupUser misses).
 *   3. `people.search` — signed-only; matches by display name. This is what
 *      Flickr's own site uses behind the People tab and is the only path
 *      that resolves multi-word display names like "Andy Johnsson."
 *
 * Cached in SQLite for 30 days, keyed by input + auth-sig (the third attempt
 * only runs for signed callers, so signed and anonymous resolutions can
 * differ — keep them in separate cache slots).
 */
export async function resolveUserId(input: string): Promise<string> {
	const trimmed = input.trim();
	if (NSID_RE.test(trimmed)) return trimmed;

	const sig = await authSig();
	return wrap(key('resolveUserId', { input: trimmed, sig }), TTL, async () => {
		// 1. URL/path-alias lookup
		try {
			const res = await flickr<LookupUserResponse>({
				method: 'flickr.urls.lookupUser',
				params: { url: `https://www.flickr.com/photos/${trimmed}/` }
			});
			return res.user.id;
		} catch {
			/* fall through */
		}

		// 2. Screen-name lookup
		try {
			const res = await flickr<FindByUsernameResponse>({
				method: 'flickr.people.findByUsername',
				params: { username: trimmed }
			});
			return res.user.nsid || res.user.id;
		} catch (err) {
			// If we don't have auth available, the people.search fallback below
			// will reject for "Missing signature" — so on no-auth, surface the
			// findByUsername error now (which is typically the most descriptive
			// "User not found" message).
			if (!err || !(err instanceof FlickrError)) throw err;
			// continue to fallback
		}

		// 3. Display-name search (signed). Returns multiple candidates ranked
		// by Flickr's own relevance; we pick the first one. Common-name
		// ambiguity ("John Smith") is a known limitation — future work could
		// surface a disambiguation page.
		const res = await flickrMaybeSigned<PeopleSearchResponse>({
			method: 'flickr.people.search',
			params: { text: trimmed, per_page: '10' }
		});
		const rawPerson = res.people?.person;
		const personArr = Array.isArray(rawPerson) ? rawPerson : rawPerson ? [rawPerson] : [];
		const first = personArr[0];
		const nsid = first?.nsid || first?.id;
		if (!nsid) {
			throw new FlickrError(1, `User "${trimmed}" not found`);
		}
		return nsid;
	});
}
