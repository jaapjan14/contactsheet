import { error } from '@sveltejs/kit';
import { flickr, FlickrError } from '$lib/server/flickr/client';
import { getGalleryInfo, getGalleryPhotos } from '$lib/server/flickr/galleries';
import type { PeopleGetInfoResponse } from '$lib/server/flickr/types';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
	try {
		const gallery = await getGalleryInfo(params.id);
		const [info, photos] = await Promise.all([
			flickr<PeopleGetInfoResponse>({
				method: 'flickr.people.getInfo',
				params: { user_id: gallery.owner }
			}),
			getGalleryPhotos(params.id, 1)
		]);
		return {
			galleryId: params.id,
			gallery,
			user: info.person,
			userKey: info.person.path_alias || info.person.nsid,
			photos
		};
	} catch (err) {
		if (err instanceof FlickrError) {
			throw error(404, err.message);
		}
		throw err;
	}
};
