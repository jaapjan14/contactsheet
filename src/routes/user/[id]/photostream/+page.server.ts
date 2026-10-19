import { error } from '@sveltejs/kit';
import { FlickrError } from '$lib/server/flickr/client';
import { resolveUserId } from '$lib/server/flickr/users';
import { getPersonInfo } from '$lib/server/flickr/people';
import { searchPhotos } from '$lib/server/flickr/search';
import { getPhotostreamPage } from '$lib/server/flickr/sorted';
import { pickSort, sortCookieName } from '$lib/sort';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, url, cookies }) => {
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
	const sort = pickSort(
		'photostream',
		url.searchParams.get('sort'),
		cookies.get(sortCookieName('photostream'))
	);

	const [user, photos] = await Promise.all([
		getPersonInfo(userId),
		query
			? searchPhotos({ userId, text: query, sort: 'relevance' })
			: getPhotostreamPage(userId, sort, 1)
	]);

	return {
		userKey: params.id,
		userId,
		user,
		photos,
		query,
		sort
	};
};
