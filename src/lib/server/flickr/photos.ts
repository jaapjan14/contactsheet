import { FlickrError } from './client';
import { flickrMaybeSigned } from './authenticated';
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

// 1 hour. `getInfo` carries the live view count, which is why this can't be
// cached for days — a popular photo's counter would freeze and read way low.
// Title/description/tags also live here; they rarely change, but an hour-old
// cache for those is fine.
const TTL_INFO = 60 * 60;
const TTL_SIZES = 7 * 24 * 60 * 60;
const TTL_EXIF = 30 * 24 * 60 * 60; // 30 days — EXIF doesn't change once uploaded
const TTL_COMMENTS = 60; // 1 minute — comments are mutable
const TTL_FAVES = 60; // 1 minute — fave count is mutable
const TTL_CONTEXTS = 60 * 60; // 1 hour — album/group membership is fairly stable

export async function getPhotoInfo(photoId: string): Promise<FlickrPhotoInfo> {
	// Key suffix bumped when TTL_INFO dropped from 7d → 1h, so any entries
	// written under the old long TTL are orphaned and get purged on schedule
	// instead of serving stale view counts for up to a week.
	return wrap(key('photos.getInfo.v2', { photo_id: photoId }), TTL_INFO, async () => {
		const res = await flickrMaybeSigned<PhotosGetInfoResponse>({
			method: 'flickr.photos.getInfo',
			params: { photo_id: photoId }
		});
		return res.photo;
	});
}

// ---- Photo contexts (albums + groups the photo belongs to) ------------

export interface PhotoContextSet {
	id: string;
	title: string;
	view_count?: string;
	comment_count?: string;
	count_photo?: string;
	count_video?: string;
}

export interface PhotoContextPool {
	id: string;
	title: string;
}

export interface PhotoContexts {
	albums: PhotoContextSet[];
	groups: PhotoContextPool[];
}

interface AllContextsResponse {
	stat: string;
	set?: PhotoContextSet[];
	pool?: PhotoContextPool[];
}

export async function getPhotoContexts(photoId: string): Promise<PhotoContexts> {
	return wrap(key('photos.getAllContexts', { photo_id: photoId }), TTL_CONTEXTS, async () => {
		const res = await flickrMaybeSigned<AllContextsResponse>({
			method: 'flickr.photos.getAllContexts',
			params: { photo_id: photoId }
		});
		return {
			albums: res.set ?? [],
			groups: res.pool ?? []
		};
	});
}

export async function getPhotoSizes(photoId: string): Promise<FlickrSizeEntry[]> {
	return wrap(key('photos.getSizes', { photo_id: photoId }), TTL_SIZES, async () => {
		const res = await flickrMaybeSigned<PhotosGetSizesResponse>({
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
		const res = await flickrMaybeSigned<PhotosGetExifResponse>({
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
			const res = await flickrMaybeSigned<PhotosCommentsGetListResponse>({
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

interface FavoritesCountResponse {
	stat: string;
	photo: { total: number | string; page: number; pages: number };
}

/**
 * Just the fave count for a photo — `flickr.photos.getInfo` doesn't include it,
 * so we hit `getFavorites` with per_page=1 and read `total`.
 */
export async function getPhotoFavoritesCount(photoId: string): Promise<number> {
	return wrap(key('photos.favoritesCount', { photo_id: photoId }), TTL_FAVES, async () => {
		try {
			const res = await flickrMaybeSigned<FavoritesCountResponse>({
				method: 'flickr.photos.getFavorites',
				params: { photo_id: photoId, per_page: '1' }
			});
			return Number(res.photo.total) || 0;
		} catch (err) {
			if (err instanceof FlickrError) return 0;
			throw err;
		}
	});
}
