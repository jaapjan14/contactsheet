import { error } from '@sveltejs/kit';
import { flickr, FlickrError } from '$lib/server/flickr/client';
import { getAlbumPhotos } from '$lib/server/flickr/photosets';
import type { PeopleGetInfoResponse } from '$lib/server/flickr/types';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
	try {
		const album = await getAlbumPhotos(params.id, 1);
		const info = await flickr<PeopleGetInfoResponse>({
			method: 'flickr.people.getInfo',
			params: { user_id: album.owner }
		});
		return {
			albumId: params.id,
			album,
			user: info.person,
			userKey: info.person.path_alias || info.person.nsid
		};
	} catch (err) {
		if (err instanceof FlickrError) {
			throw error(404, err.message);
		}
		throw err;
	}
};
