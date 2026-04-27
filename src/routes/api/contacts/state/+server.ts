import { error, json } from '@sveltejs/kit';
import { readAuth } from '$lib/server/auth/store';
import { getMyContactNsidSet } from '$lib/server/flickr/contacts';
import type { RequestHandler } from './$types';

/**
 * GET /api/contacts/state?nsid=<flickr nsid>
 * Returns whether the authed user follows that user on Flickr.
 *
 * Anonymous callers get { signedIn: false, following: false } — the UI
 * uses this to hide the follow indicator entirely. We do not 401 here so
 * the user-page render path doesn't have to special-case the anonymous
 * fetch failure.
 */
export const GET: RequestHandler = async ({ url }) => {
	const nsid = (url.searchParams.get('nsid') ?? '').trim();
	if (!nsid) throw error(400, 'nsid query param required');

	const auth = await readAuth();
	if (!auth) return json({ signedIn: false, following: false, isSelf: false });

	const set = await getMyContactNsidSet(auth.nsid);
	return json({
		signedIn: true,
		following: set.has(nsid),
		isSelf: auth.nsid === nsid
	});
};
