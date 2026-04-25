import { flickr } from './client';
import { flickrMaybeSigned } from './authenticated';
import { wrap, key } from '$lib/server/cache';
import type {
	PhotosetsGetListResponse,
	PhotosetGetPhotosResponse,
	PhotosetsList,
	PhotosetWithPhotos
} from './types';

const DEFAULT_PER_PAGE = 100;
const TTL_LIST = 5 * 60;
const TTL_PHOTOS = 5 * 60;

export async function getUserAlbums(
	userId: string,
	page = 1,
	perPage = DEFAULT_PER_PAGE
): Promise<PhotosetsList> {
	return wrap(
		key('photosets.getList', { user_id: userId, page, per_page: perPage }),
		TTL_LIST,
		async () => {
			const res = await flickr<PhotosetsGetListResponse>({
				method: 'flickr.photosets.getList',
				params: {
					user_id: userId,
					per_page: String(perPage),
					page: String(page)
				}
			});
			return res.photosets;
		}
	);
}

export async function getAlbumPhotos(
	albumId: string,
	page = 1,
	perPage = DEFAULT_PER_PAGE
): Promise<PhotosetWithPhotos> {
	return wrap(
		key('photosets.getPhotos', { album_id: albumId, page, per_page: perPage }),
		TTL_PHOTOS,
		async () => {
			const res = await flickrMaybeSigned<PhotosetGetPhotosResponse>({
				method: 'flickr.photosets.getPhotos',
				params: {
					photoset_id: albumId,
					per_page: String(perPage),
					page: String(page),
					safe_search: '3',
					extras: 'date_taken,views,o_dims'
				}
			});
			return res.photoset;
		}
	);
}
