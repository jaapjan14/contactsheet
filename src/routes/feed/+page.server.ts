import { FlickrError } from '$lib/server/flickr/client';
import { readAuth } from '$lib/server/auth/store';
import { searchPhotos } from '$lib/server/flickr/search';
import type { PhotosPage } from '$lib/server/flickr/types';
import type { PageServerLoad } from './$types';

const PER_PAGE = 100;

export const load: PageServerLoad = async () => {
	const auth = await readAuth();
	if (!auth) {
		// Not signed in: render the page with a sign-in nudge instead of
		// redirecting — the rest of the app stays accessible to anonymous
		// browsers, so /feed should match that pattern.
		return { signedIn: false, photos: null, feedError: null };
	}

	let photos: PhotosPage | null = null;
	let feedError: string | null = null;
	try {
		// `contacts: 'all'` scopes the search to people the authed user follows.
		// Sorted newest-first, paginated. Replaces the older
		// `flickr.photos.getContactsPhotos` call which capped at 50 with no
		// pagination — see CHANGELOG note for the side-by-side comparison.
		photos = await searchPhotos({
			contacts: 'all',
			sort: 'date-posted-desc',
			page: 1,
			perPage: PER_PAGE
		});
	} catch (err) {
		if (err instanceof FlickrError) {
			feedError = err.message;
		} else {
			throw err;
		}
	}

	return { signedIn: true, photos, feedError };
};
