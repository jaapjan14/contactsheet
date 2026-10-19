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

// Upper bound on how many faves we pull to sort by date taken: 8 calls of 500.
// Faves beyond this (the oldest-faved) are left out of the date-taken orders.
const SORT_CAP = 4000;
const SORT_BATCH = 500;

export interface SortedFavesPage extends PhotosPage {
	/** true when the user has more faves than SORT_CAP, so the sort only covers the most recent ones */
	capped: boolean;
	/** how many faves the sorted order covers (= total unless capped) */
	sortedCount: number;
}

/**
 * Faves ordered by date taken. Neither faves endpoint takes a sort param (both
 * return newest-faved first), so fetch the list in 500s, sort it here and
 * slice out the requested page. Each 500-batch rides the getUserFaves cache.
 */
export async function getUserFavesByDateTaken(
	targetUserId: string,
	order: 'asc' | 'desc',
	page = 1,
	perPage = DEFAULT_PER_PAGE
): Promise<SortedFavesPage> {
	const first = await getUserFaves(targetUserId, 1, SORT_BATCH);
	const batches = Math.min(Number(first.pages), SORT_CAP / SORT_BATCH);
	const rest = await Promise.all(
		Array.from({ length: Math.max(0, batches - 1) }, (_, i) =>
			getUserFaves(targetUserId, i + 2, SORT_BATCH)
		)
	);
	const all = [first, ...rest].flatMap((b) => b.photo);
	// datetaken is "YYYY-MM-DD HH:MM:SS", so string order is date order.
	all.sort((a, b) => (a.datetaken ?? '').localeCompare(b.datetaken ?? ''));
	if (order === 'desc') all.reverse();

	const pages = Math.max(1, Math.ceil(all.length / perPage));
	return {
		page,
		pages,
		perpage: perPage,
		total: Number(first.total),
		photo: all.slice((page - 1) * perPage, page * perPage),
		// Compare pages, not counts: Flickr's total includes faves it won't
		// return (deleted/now-private photos), so the counts rarely match.
		capped: Number(first.pages) > batches,
		sortedCount: all.length
	};
}
