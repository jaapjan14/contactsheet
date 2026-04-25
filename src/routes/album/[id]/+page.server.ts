import { error } from '@sveltejs/kit';
import { FlickrError } from '$lib/server/flickr/client';
import { getAlbumPhotos } from '$lib/server/flickr/photosets';
import { getPersonInfo } from '$lib/server/flickr/people';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
	try {
		const album = await getAlbumPhotos(params.id, 1);
		const user = await getPersonInfo(album.owner);
		return {
			albumId: params.id,
			album,
			user,
			userKey: user.path_alias || user.nsid
		};
	} catch (err) {
		if (err instanceof FlickrError) {
			throw error(404, err.message);
		}
		throw err;
	}
};
