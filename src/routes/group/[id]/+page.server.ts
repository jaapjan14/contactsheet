import { error } from '@sveltejs/kit';
import { FlickrError } from '$lib/server/flickr/client';
import { resolveGroupId, getGroupInfo, getGroupPhotos } from '$lib/server/flickr/groups';
import { searchPhotos } from '$lib/server/flickr/search';
import type { PhotosPage } from '$lib/server/flickr/types';
import type { PageServerLoad } from './$types';

const EMPTY_POOL: PhotosPage = {
	page: 1,
	pages: 0,
	perpage: 100,
	total: 0,
	photo: []
};

export const load: PageServerLoad = async ({ params, url }) => {
	let groupId: string;
	try {
		groupId = await resolveGroupId(params.id);
	} catch (err) {
		if (err instanceof FlickrError) {
			throw error(404, `Group "${params.id}" not found on Flickr`);
		}
		throw err;
	}

	// Group info is required — if we can't read it, the group is genuinely
	// inaccessible (private + not a member, doesn't exist, etc.). 404.
	let info;
	try {
		info = await getGroupInfo(groupId);
	} catch (err) {
		if (err instanceof FlickrError) {
			throw error(404, `Can't read group "${params.id}": ${err.message}`);
		}
		throw err;
	}

	// `?q=…` switches the grid into in-group search mode (photos.search scoped
	// to this group_id). Empty/missing q falls back to the regular pool listing.
	const q = (url.searchParams.get('q') ?? '').trim();

	let photos: PhotosPage = EMPTY_POOL;
	let poolError: string | null = null;
	try {
		photos = q
			? await searchPhotos({ groupId, text: q, page: 1, sort: 'relevance' })
			: await getGroupPhotos(groupId, 1);
	} catch (err) {
		if (err instanceof FlickrError) {
			poolError = err.message;
		} else {
			throw err;
		}
	}

	return {
		groupKey: params.id,
		groupId,
		group: info,
		photos,
		poolError,
		query: q
	};
};
