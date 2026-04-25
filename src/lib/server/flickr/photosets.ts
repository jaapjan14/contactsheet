import { flickr } from './client';
import type {
	PhotosetsGetListResponse,
	PhotosetGetPhotosResponse,
	PhotosetsList,
	PhotosetWithPhotos
} from './types';

const DEFAULT_PER_PAGE = 100;

export async function getUserAlbums(
	userId: string,
	page = 1,
	perPage = DEFAULT_PER_PAGE
): Promise<PhotosetsList> {
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

export async function getAlbumPhotos(
	albumId: string,
	page = 1,
	perPage = DEFAULT_PER_PAGE
): Promise<PhotosetWithPhotos> {
	const res = await flickr<PhotosetGetPhotosResponse>({
		method: 'flickr.photosets.getPhotos',
		params: {
			photoset_id: albumId,
			per_page: String(perPage),
			page: String(page),
			extras: 'date_taken,views,o_dims'
		}
	});
	return res.photoset;
}
