import { flickr } from './client';
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

export async function getPersonInfo(userId: string): Promise<FlickrPersonInfo> {
	return wrap(key('people.getInfo', { user_id: userId }), TTL_PERSON, async () => {
		const res = await flickr<PeopleGetInfoResponse>({
			method: 'flickr.people.getInfo',
			params: { user_id: userId }
		});
		return res.person;
	});
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
			const res = await flickr<PeopleGetPhotosResponse>({
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
