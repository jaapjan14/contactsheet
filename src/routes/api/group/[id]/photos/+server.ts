import { error, json } from '@sveltejs/kit';
import { FlickrError } from '$lib/server/flickr/client';
import { resolveGroupId, getGroupPhotos } from '$lib/server/flickr/groups';
import { searchPhotos } from '$lib/server/flickr/search';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, url }) => {
	const page = Math.max(1, Number(url.searchParams.get('page') ?? '1'));
	const q = (url.searchParams.get('q') ?? '').trim();

	let groupId: string;
	try {
		groupId = await resolveGroupId(params.id);
	} catch (err) {
		if (err instanceof FlickrError) throw error(404, `Group "${params.id}" not found`);
		throw err;
	}

	try {
		// `q` present → in-group search via flickr.photos.search&group_id=&text=.
		// Empty `q` keeps the regular pool listing (groups.pools.getPhotos), which
		// is the same path /search uses everywhere else in the app.
		const photos = q
			? await searchPhotos({ groupId, text: q, page, sort: 'relevance' })
			: await getGroupPhotos(groupId, page);
		return json(photos);
	} catch (err) {
		if (err instanceof FlickrError) throw error(502, err.message);
		throw err;
	}
};
