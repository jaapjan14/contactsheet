import { error, json } from '@sveltejs/kit';
import { FlickrError } from '$lib/server/flickr/client';
import { readAuth } from '$lib/server/auth/store';
import { searchPhotos } from '$lib/server/flickr/search';
import type { RequestHandler } from './$types';

const PER_PAGE = 100;

/**
 * GET /api/feed?page=N — paginated contacts feed for the authed user.
 * Backed by `flickr.photos.search&contacts=all`. Anonymous callers 401.
 */
export const GET: RequestHandler = async ({ url }) => {
	const auth = await readAuth();
	if (!auth) throw error(401, 'Sign in to Flickr first');

	const page = Math.max(1, Number(url.searchParams.get('page') ?? '1'));

	try {
		const photos = await searchPhotos({
			contacts: 'all',
			sort: 'date-posted-desc',
			page,
			perPage: PER_PAGE
		});
		return json(photos);
	} catch (err) {
		if (err instanceof FlickrError) throw error(502, err.message);
		throw err;
	}
};
