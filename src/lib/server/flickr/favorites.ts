import { flickr } from './client';
import { flickrAuth } from './authenticated';
import { readAuth } from '$lib/server/auth/store';
import type { PhotosPage } from './types';

const DEFAULT_PER_PAGE = 100;

interface FavesResponse {
	stat: string;
	photos: PhotosPage;
}

const FAVES_EXTRAS = 'date_taken,views,o_dims,owner_name';

/**
 * Get a user's faves.
 *
 * If the signed-in viewer == the target, we use the authenticated
 * `flickr.favorites.getList` endpoint, which surfaces both public AND private
 * faves (faves visible to that user). Otherwise we fall back to
 * `flickr.favorites.getPublicList`, which only returns public faves.
 */
export async function getUserFaves(
	targetUserId: string,
	page = 1,
	perPage = DEFAULT_PER_PAGE
): Promise<PhotosPage> {
	const auth = await readAuth();
	const isSelf = auth?.nsid === targetUserId;

	if (isSelf) {
		const res = await flickrAuth<FavesResponse>({
			method: 'flickr.favorites.getList',
			params: {
				per_page: String(perPage),
				page: String(page),
				extras: FAVES_EXTRAS
			}
		});
		return res.photos;
	}

	const res = await flickr<FavesResponse>({
		method: 'flickr.favorites.getPublicList',
		params: {
			user_id: targetUserId,
			per_page: String(perPage),
			page: String(page),
			extras: FAVES_EXTRAS
		}
	});
	return res.photos;
}
