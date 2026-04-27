import { flickrMaybeSigned } from './authenticated';
import { wrap, key } from '$lib/server/cache';
import type { PhotosPage } from './types';

const DEFAULT_PER_PAGE = 100;
const TTL = 60; // 1 minute — search results are dynamic but repeat-clicks should be free

export type SearchSort =
	| 'relevance'
	| 'date-posted-desc'
	| 'date-posted-asc'
	| 'date-taken-desc'
	| 'date-taken-asc'
	| 'interestingness-desc'
	| 'interestingness-asc';

export interface SearchOptions {
	text?: string;
	userId?: string;
	groupId?: string;
	tags?: string;
	/**
	 * Restrict results to your Flickr contacts. `all` = everyone you follow,
	 * `ff` = friends + family only. Requires an authenticated call — Flickr
	 * silently returns nothing if unsigned.
	 */
	contacts?: 'all' | 'ff';
	sort?: SearchSort;
	page?: number;
	perPage?: number;
}

interface SearchResponse {
	stat: string;
	photos: PhotosPage;
}

export async function searchPhotos(opts: SearchOptions): Promise<PhotosPage> {
	const params: Record<string, string> = {
		per_page: String(opts.perPage ?? DEFAULT_PER_PAGE),
		page: String(opts.page ?? 1),
		extras: 'date_taken,views,o_dims,owner_name,path_alias',
		// 3 = unrestricted (safe + moderate + restricted). Personal tool, no
		// reason to filter adult content. Requires a signed call to take effect
		// (Flickr silently downgrades unsigned restricted requests).
		safe_search: '3',
		// content_type=7 = photos + screenshots + illustrations. media=photos
		// excludes videos because /photo/[id] is built to render still images
		// only — clicking a video would 404 in the lightbox.
		content_type: '7',
		media: 'photos',
		sort: opts.sort ?? 'relevance'
	};
	if (opts.text) params.text = opts.text;
	if (opts.userId) params.user_id = opts.userId;
	if (opts.groupId) params.group_id = opts.groupId;
	if (opts.contacts) params.contacts = opts.contacts;
	if (opts.tags) {
		params.tags = opts.tags;
		params.tag_mode = 'all';
	}
	return wrap(
		key('photos.search', {
			text: opts.text,
			user_id: opts.userId,
			group_id: opts.groupId,
			contacts: opts.contacts,
			tags: opts.tags,
			sort: opts.sort ?? 'relevance',
			page: opts.page ?? 1,
			per_page: opts.perPage ?? DEFAULT_PER_PAGE
		}),
		TTL,
		async () => {
			// flickrMaybeSigned: Flickr ignores safe_search=3 on unsigned calls.
			// Signing the call respects the param and the calling user's account
			// content-level preferences (see flickr.com Settings > Privacy).
			const res = await flickrMaybeSigned<SearchResponse>({
				method: 'flickr.photos.search',
				params
			});
			return res.photos;
		}
	);
}
