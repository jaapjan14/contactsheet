import { flickr } from './client';
import type {
	GalleriesGetListResponse,
	GalleriesGetPhotosResponse,
	GalleriesGetInfoResponse,
	GalleriesList,
	FlickrGallery,
	PhotosPage
} from './types';

const DEFAULT_PER_PAGE = 100;

export async function getUserGalleries(
	userId: string,
	page = 1,
	perPage = DEFAULT_PER_PAGE
): Promise<GalleriesList> {
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

export async function getGalleryInfo(galleryId: string): Promise<FlickrGallery> {
	const res = await flickr<GalleriesGetInfoResponse>({
		method: 'flickr.galleries.getInfo',
		params: { gallery_id: galleryId }
	});
	return res.gallery;
}

export async function getGalleryPhotos(
	galleryId: string,
	page = 1,
	perPage = DEFAULT_PER_PAGE
): Promise<PhotosPage> {
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
