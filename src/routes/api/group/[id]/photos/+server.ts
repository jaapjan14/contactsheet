import { error, json } from '@sveltejs/kit';
import { FlickrError } from '$lib/server/flickr/client';
import { resolveGroupId } from '$lib/server/flickr/groups';
import { searchPhotos } from '$lib/server/flickr/search';
import { getGroupPage } from '$lib/server/flickr/sorted';
import { pickSort } from '$lib/sort';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, url }) => {
	const page = Math.max(1, Number(url.searchParams.get('page') ?? '1'));
	const q = (url.searchParams.get('q') ?? '').trim();
	const sort = pickSort('group', url.searchParams.get('sort'), null);

	let groupId: string;
	try {
		groupId = await resolveGroupId(params.id);
	} catch (err) {
		if (err instanceof FlickrError) throw error(404, `Group "${params.id}" not found`);
		throw err;
	}

	try {
		// `q` present → in-group search via flickr.photos.search&group_id=&text=.
		// Empty `q` lists the pool in the chosen sort order (see getGroupPage).
		const photos = q
			? await searchPhotos({ groupId, text: q, page, sort: 'relevance' })
			: await getGroupPage(groupId, sort, page);
		return json(photos);
	} catch (err) {
		if (err instanceof FlickrError) throw error(502, err.message);
		throw err;
	}
};
