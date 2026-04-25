import { flickr } from './client';
import { wrap, key } from '$lib/server/cache';
import type {
	GalleriesGetListResponse,
	GalleriesGetPhotosResponse,
	GalleriesGetInfoResponse,
	GalleriesList,
	FlickrGallery,
	PhotosPage
} from './types';

const DEFAULT_PER_PAGE = 100;
const TTL_LIST = 5 * 60;
const TTL_INFO = 60 * 60;
const TTL_PHOTOS = 5 * 60;

export async function getUserGalleries(
	userId: string,
	page = 1,
	perPage = DEFAULT_PER_PAGE
): Promise<GalleriesList> {
	return wrap(
		key('galleries.getList', { user_id: userId, page, per_page: perPage }),
		TTL_LIST,
		async () => {
			const res = await flickr<GalleriesGetListResponse>({
				method: 'flickr.galleries.getList',
				params: {
					user_id: userId,
					per_page: String(perPage),
					page: String(page)
				}
			});
			return res.galleries;
		}
	);
}

export async function getGalleryInfo(galleryId: string): Promise<FlickrGallery> {
	return wrap(key('galleries.getInfo', { gallery_id: galleryId }), TTL_INFO, async () => {
		const res = await flickr<GalleriesGetInfoResponse>({
			method: 'flickr.galleries.getInfo',
			params: { gallery_id: galleryId }
		});
		return res.gallery;
	});
}

export async function getGalleryPhotos(
	galleryId: string,
	page = 1,
	perPage = DEFAULT_PER_PAGE
): Promise<PhotosPage> {
	return wrap(
		key('galleries.getPhotos', { gallery_id: galleryId, page, per_page: perPage }),
		TTL_PHOTOS,
		async () => {
			const res = await flickr<GalleriesGetPhotosResponse>({
				method: 'flickr.galleries.getPhotos',
				params: {
					gallery_id: galleryId,
					per_page: String(perPage),
					page: String(page),
					extras: 'date_taken,views,o_dims,owner_name'
				}
			});
			return res.photos;
		}
	);
}
