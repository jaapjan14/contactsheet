import { getUserPhotos } from './people';
import { getUserFaves, getUserFavesByDateTaken, type SortedFavesPage } from './favorites';
import { getGroupPhotos } from './groups';
import { searchPhotos, type SearchSort } from './search';
import type { PhotosPage } from './types';

// One place that turns a grid's sort value (see $lib/sort) into the right
// Flickr call, shared by each page load and its /api load-more endpoint.

export function getPhotostreamPage(userId: string, sort: string, page: number): Promise<PhotosPage> {
	// people.getPhotos is natively newest-posted first; everything else needs
	// photos.search, the only call that sorts a user's photos.
	return sort === 'date-posted-desc'
		? getUserPhotos(userId, page)
		: searchPhotos({ userId, sort: sort as SearchSort, page });
}

export async function getFavesPage(
	userId: string,
	sort: string,
	page: number
): Promise<SortedFavesPage> {
	if (sort === 'date-taken-desc' || sort === 'date-taken-asc') {
		return getUserFavesByDateTaken(userId, sort === 'date-taken-desc' ? 'desc' : 'asc', page);
	}
	const faves = await getUserFaves(userId, page);
	return { ...faves, capped: false, sortedCount: Number(faves.total) };
}

export function getGroupPage(groupId: string, sort: string, page: number): Promise<PhotosPage> {
	// groups.pools.getPhotos is natively newest-added first; photos.search with
	// group_id gives the other orders (it can't sort by date added).
	return sort === 'added-desc'
		? getGroupPhotos(groupId, page)
		: searchPhotos({ groupId, sort: sort as SearchSort, page });
}
