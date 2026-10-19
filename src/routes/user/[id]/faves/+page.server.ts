import { error } from '@sveltejs/kit';
import { FlickrError } from '$lib/server/flickr/client';
import { resolveUserId } from '$lib/server/flickr/users';
import { getPersonInfo } from '$lib/server/flickr/people';
import { getFavesPage } from '$lib/server/flickr/sorted';
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

	const sort = pickSort('faves', url.searchParams.get('sort'), cookies.get(sortCookieName('faves')));
	const [user, faves] = await Promise.all([getPersonInfo(userId), getFavesPage(userId, sort, 1)]);

	return {
		userKey: params.id,
		userId,
		user,
		faves,
		sort
	};
};
