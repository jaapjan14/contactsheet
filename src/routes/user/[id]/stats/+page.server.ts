import { error } from '@sveltejs/kit';
import { FlickrError } from '$lib/server/flickr/client';
import { resolveUserId } from '$lib/server/flickr/users';
import { getPersonInfo } from '$lib/server/flickr/people';
import { getTotalViews, getPopularPhotos } from '$lib/server/flickr/stats';
import { readAuth } from '$lib/server/auth/store';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
	const auth = await readAuth();
	if (!auth) throw error(401, 'Sign in to view stats');

	let userId: string;
	try {
		userId = await resolveUserId(params.id);
	} catch (err) {
		if (err instanceof FlickrError) {
			throw error(404, `User "${params.id}" not found on Flickr`);
		}
		throw err;
	}

	if (auth.nsid !== userId) {
		throw error(403, 'Stats are only viewable for your own account');
	}

	const user = await getPersonInfo(userId);

	// Stats is a Pro-only feature. Try the calls and catch the permission error.
	let totals = null;
	let popular = null;
	let proRequired = false;
	let statsError: string | null = null;

	try {
		const [t, p] = await Promise.all([getTotalViews(), getPopularPhotos(12)]);
		totals = t;
		popular = p;
	} catch (err) {
		if (err instanceof FlickrError) {
			// Code 1 = "User is not a pro user" on stats endpoints
			// Code 99 = insufficient permissions
			if (err.code === 1 || err.code === 99) {
				proRequired = true;
			} else {
				statsError = err.message;
			}
		} else {
			throw err;
		}
	}

	return {
		userKey: params.id,
		user,
		totals,
		popular,
		proRequired,
		statsError
	};
};
