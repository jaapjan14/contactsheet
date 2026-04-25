import { error } from '@sveltejs/kit';
import { FlickrError } from '$lib/server/flickr/client';
import {
	getPhotoInfo,
	getPhotoSizes,
	getPhotoExif,
	getPhotoComments,
	getPhotoFavoritesCount
} from '$lib/server/flickr/photos';
import type { FlickrSizeEntry } from '$lib/server/flickr/types';
import type { PageServerLoad } from './$types';

const TARGET_DISPLAY_WIDTH = 2048;

function pickDisplaySize(sizes: FlickrSizeEntry[]): FlickrSizeEntry | null {
	const photoSizes = sizes.filter((s) => s.media === 'photo');
	if (photoSizes.length === 0) return null;
	const sorted = [...photoSizes].sort((a, b) => a.width - b.width);
	const fit = sorted.filter((s) => s.width <= TARGET_DISPLAY_WIDTH).pop();
	return fit ?? sorted[sorted.length - 1];
}

export const load: PageServerLoad = async ({ params }) => {
	try {
		const [photo, sizes, exif, comments, favesCount] = await Promise.all([
			getPhotoInfo(params.id),
			getPhotoSizes(params.id),
			getPhotoExif(params.id),
			getPhotoComments(params.id),
			getPhotoFavoritesCount(params.id)
		]);

		const display = pickDisplaySize(sizes);
		if (!display) throw error(404, 'No displayable sizes for this photo');

		return {
			photo,
			display,
			exif,
			comments,
			favesCount
		};
	} catch (err) {
		if (err instanceof FlickrError) {
			throw error(404, err.message);
		}
		throw err;
	}
};
