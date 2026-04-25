import { error } from '@sveltejs/kit';
import { FlickrError } from '$lib/server/flickr/client';
import { resolveUserId } from '$lib/server/flickr/users';
import { getPersonInfo } from '$lib/server/flickr/people';
import { getUserGalleries } from '$lib/server/flickr/galleries';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
	let userId: string;
	try {
		userId = await resolveUserId(params.id);
	} catch (err) {
		if (err instanceof FlickrError) {
			throw error(404, `User "${params.id}" not found on Flickr`);
		}
		throw err;
	}

	const [user, galleries] = await Promise.all([
		getPersonInfo(userId),
		getUserGalleries(userId, 1)
	]);

	return {
		userKey: params.id,
		userId,
		user,
		galleries
	};
};
