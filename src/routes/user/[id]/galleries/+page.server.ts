import { error } from '@sveltejs/kit';
import { flickr, FlickrError } from '$lib/server/flickr/client';
import { resolveUserId } from '$lib/server/flickr/users';
import { getUserGalleries } from '$lib/server/flickr/galleries';
import type { PeopleGetInfoResponse } from '$lib/server/flickr/types';
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

	const [info, galleries] = await Promise.all([
		flickr<PeopleGetInfoResponse>({
			method: 'flickr.people.getInfo',
			params: { user_id: userId }
		}),
		getUserGalleries(userId, 1)
	]);

	return {
		userKey: params.id,
		userId,
		user: info.person,
		galleries
	};
};
