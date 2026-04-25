import { error } from '@sveltejs/kit';
import { FlickrError } from '$lib/server/flickr/client';
import { getGalleryInfo, getGalleryPhotos } from '$lib/server/flickr/galleries';
import { getPersonInfo } from '$lib/server/flickr/people';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
	try {
		const gallery = await getGalleryInfo(params.id);
		const [user, photos] = await Promise.all([
			getPersonInfo(gallery.owner),
			getGalleryPhotos(params.id, 1)
		]);
		return {
			galleryId: params.id,
			gallery,
			user,
			userKey: user.path_alias || user.nsid,
			photos
		};
	} catch (err) {
		if (err instanceof FlickrError) {
			throw error(404, err.message);
		}
		throw err;
	}
};
