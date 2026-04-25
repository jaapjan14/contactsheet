import { flickr, FlickrError } from './client';
import { wrap, key, get as cacheGet, set as cacheSet } from '$lib/server/cache';
import type {
	PhotosGetInfoResponse,
	PhotosGetSizesResponse,
	PhotosGetExifResponse,
	PhotosCommentsGetListResponse,
	FlickrPhotoInfo,
	FlickrSizeEntry,
	FlickrComment
} from './types';

const TTL_INFO = 7 * 24 * 60 * 60; // 7 days
const TTL_SIZES = 7 * 24 * 60 * 60;
const TTL_EXIF = 30 * 24 * 60 * 60; // 30 days — EXIF doesn't change once uploaded
const TTL_COMMENTS = 60; // 1 minute — comments are mutable

export async function getPhotoInfo(photoId: string): Promise<FlickrPhotoInfo> {
	return wrap(key('photos.getInfo', { photo_id: photoId }), TTL_INFO, async () => {
		const res = await flickr<PhotosGetInfoResponse>({
			method: 'flickr.photos.getInfo',
			params: { photo_id: photoId }
		});
		return res.photo;
	});
}

export async function getPhotoSizes(photoId: string): Promise<FlickrSizeEntry[]> {
	return wrap(key('photos.getSizes', { photo_id: photoId }), TTL_SIZES, async () => {
		const res = await flickr<PhotosGetSizesResponse>({
			method: 'flickr.photos.getSizes',
			params: { photo_id: photoId }
		});
		return res.sizes.size;
	});
}

/**
 * EXIF can be private. Cache only successful responses; on failure return null
 * without poisoning the cache (so a future re-upload with public EXIF gets through).
 */
export async function getPhotoExif(
	photoId: string
): Promise<PhotosGetExifResponse['photo'] | null> {
	const k = key('photos.getExif', { photo_id: photoId });
	const cached = cacheGet<PhotosGetExifResponse['photo']>(k);
	if (cached) return cached;
	try {
		const res = await flickr<PhotosGetExifResponse>({
			method: 'flickr.photos.getExif',
			params: { photo_id: photoId }
		});
		cacheSet(k, res.photo, TTL_EXIF);
		return res.photo;
	} catch (err) {
		if (err instanceof FlickrError) return null;
		throw err;
	}
}

export async function getPhotoComments(photoId: string): Promise<FlickrComment[]> {
	return wrap(key('photos.comments', { photo_id: photoId }), TTL_COMMENTS, async () => {
		try {
			const res = await flickr<PhotosCommentsGetListResponse>({
				method: 'flickr.photos.comments.getList',
				params: { photo_id: photoId }
			});
			return res.comments.comment ?? [];
		} catch (err) {
			if (err instanceof FlickrError) return [];
			throw err;
		}
	});
}
