import { flickr } from './client';
import type { PeopleGetPhotosResponse, PhotosPage } from './types';

const DEFAULT_PER_PAGE = 100;

export async function getUserPhotos(
	userId: string,
	page = 1,
	perPage = DEFAULT_PER_PAGE
): Promise<PhotosPage> {
	const res = await flickr<PeopleGetPhotosResponse>({
		method: 'flickr.people.getPhotos',
		params: {
			user_id: userId,
			per_page: String(perPage),
			page: String(page),
			extras: 'date_taken,views,o_dims'
		}
	});
	return res.photos;
}
