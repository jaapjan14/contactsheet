import { flickr } from './client';
import { flickrMaybeSigned } from './authenticated';
import { wrap, key } from '$lib/server/cache';
import type {
	PeopleGetInfoResponse,
	PeopleGetPhotosResponse,
	PhotosPage,
	FlickrPersonInfo
} from './types';

const DEFAULT_PER_PAGE = 100;
const TTL_PERSON = 60 * 60; // 1 hour
const TTL_PHOTOS = 60; // 1 minute — frequently appended to
const TTL_POPULAR = 60 * 60; // 1 hour — popularity changes slowly

export async function getPersonInfo(userId: string): Promise<FlickrPersonInfo> {
	return wrap(key('people.getInfo', { user_id: userId }), TTL_PERSON, async () => {
		const res = await flickr<PeopleGetInfoResponse>({
			method: 'flickr.people.getInfo',
			params: { user_id: userId }
		});
		return res.person;
	});
}

export type PopularSort = 'views' | 'comments' | 'faves' | 'interesting';

interface PopularResponse {
	stat: string;
	photos: PhotosPage;
}

/**
 * Most popular photos for a user. Backed by `flickr.photos.getPopular`,
 * which Flickr surfaces sorted by views / faves / comments / interesting.
 * Cached for an hour because popularity moves slowly.
 */
export async function getPopularPhotos(
	userId: string,
	sort: PopularSort = 'views',
	perPage = 12
): Promise<PhotosPage> {
	return wrap(
		key('photos.getPopular', { user_id: userId, sort, per_page: perPage }),
		TTL_POPULAR,
		async () => {
			const res = await flickrMaybeSigned<PopularResponse>({
				method: 'flickr.photos.getPopular',
				params: {
					user_id: userId,
					sort,
					per_page: String(perPage),
					page: '1',
					safe_search: '3',
					extras: 'date_taken,views,o_dims,owner_name,path_alias'
				}
			});
			return res.photos;
		}
	);
}

export async function getUserPhotos(
	userId: string,
	page = 1,
	perPage = DEFAULT_PER_PAGE
): Promise<PhotosPage> {
	return wrap(
		key('people.getPhotos', { user_id: userId, page, per_page: perPage }),
		TTL_PHOTOS,
		async () => {
			// Signed + safe_search=3: signed call so Flickr respects safe_search=3
			// (otherwise quietly downgraded). Without this, users whose photos are
			// rated moderate/restricted (artistic nudes, etc.) appear empty or
			// with only their handful of safe-rated photos.
			const res = await flickrMaybeSigned<PeopleGetPhotosResponse>({
				method: 'flickr.people.getPhotos',
				params: {
					user_id: userId,
					per_page: String(perPage),
					page: String(page),
					safe_search: '3',
					extras: 'date_taken,views,o_dims'
				}
			});
			return res.photos;
		}
	);
}
