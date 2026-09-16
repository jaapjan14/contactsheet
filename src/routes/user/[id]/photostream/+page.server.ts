import { error } from '@sveltejs/kit';
import { FlickrError } from '$lib/server/flickr/client';
import { resolveUserId } from '$lib/server/flickr/users';
import { getPersonInfo, getUserPhotos } from '$lib/server/flickr/people';
import { searchPhotos } from '$lib/server/flickr/search';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, url }) => {
	let userId: string;
	try {
		userId = await resolveUserId(params.id);
	} catch (err) {
		if (err instanceof FlickrError) {
			throw error(404, `User "${params.id}" not found on Flickr`);
		}
		throw err;
	}

	const query = url.searchParams.get('q')?.trim() || '';

	const [user, photos] = await Promise.all([
		getPersonInfo(userId),
		query ? searchPhotos({ userId, text: query, sort: 'relevance' }) : getUserPhotos(userId, 1)
	]);

	return {
		userKey: params.id,
		userId,
		user,
		photos,
		query
	};
};
