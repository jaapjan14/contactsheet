import { flickrAuth, flickrMaybeSigned } from './authenticated';
import { readAuth } from '$lib/server/auth/store';
import { wrap, key } from '$lib/server/cache';
import type { PhotosPage } from './types';

const DEFAULT_PER_PAGE = 100;
const TTL_PUBLIC = 5 * 60; // 5 minutes
const TTL_OWN = 30; // 30 seconds — own faves are mutable

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
		return wrap(
			key('favorites.getList', { user: auth!.nsid, page, per_page: perPage }),
			TTL_OWN,
			async () => {
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
		);
	}

	return wrap(
		key('favorites.getPublicList', { user_id: targetUserId, page, per_page: perPage }),
		TTL_PUBLIC,
		async () => {
			const res = await flickrMaybeSigned<FavesResponse>({
				method: 'flickr.favorites.getPublicList',
				params: {
					user_id: targetUserId,
					per_page: String(perPage),
					page: String(page),
					safe_search: '3',
					extras: FAVES_EXTRAS
				}
			});
			return res.photos;
		}
	);
}
