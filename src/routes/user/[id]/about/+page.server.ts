import { error } from '@sveltejs/kit';
import { FlickrError } from '$lib/server/flickr/client';
import { resolveUserId } from '$lib/server/flickr/users';
import { getPersonInfo, getPopularPhotos } from '$lib/server/flickr/people';
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

	// Popular is best-effort — if it fails (e.g. user has no photos, or Flickr
	// hiccups), we still render the rest of the about page.
	const [user, popular] = await Promise.all([
		getPersonInfo(userId),
		getPopularPhotos(userId, 'views', 12).catch(() => null)
	]);

	return {
		userKey: params.id,
		userId,
		user,
		popular
	};
};
