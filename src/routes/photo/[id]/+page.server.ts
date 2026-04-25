import { error } from '@sveltejs/kit';
import { flickr, FlickrError } from '$lib/server/flickr/client';
import type {
	PhotosGetInfoResponse,
	PhotosGetSizesResponse,
	PhotosGetExifResponse,
	PhotosCommentsGetListResponse,
	FlickrSizeEntry
} from '$lib/server/flickr/types';
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
		const [info, sizes, exif, comments] = await Promise.all([
			flickr<PhotosGetInfoResponse>({
				method: 'flickr.photos.getInfo',
				params: { photo_id: params.id }
			}),
			flickr<PhotosGetSizesResponse>({
				method: 'flickr.photos.getSizes',
				params: { photo_id: params.id }
			}),
			flickr<PhotosGetExifResponse>({
				method: 'flickr.photos.getExif',
				params: { photo_id: params.id }
			}).catch(() => null),
			flickr<PhotosCommentsGetListResponse>({
				method: 'flickr.photos.comments.getList',
				params: { photo_id: params.id }
			}).catch(() => null)
		]);

		const display = pickDisplaySize(sizes.sizes.size);
		if (!display) throw error(404, 'No displayable sizes for this photo');

		return {
			photo: info.photo,
			display,
			exif: exif?.photo ?? null,
			comments: comments?.comments.comment ?? []
		};
	} catch (err) {
		if (err instanceof FlickrError) {
			throw error(404, err.message);
		}
		throw err;
	}
};
