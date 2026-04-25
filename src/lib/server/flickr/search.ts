import { flickr } from './client';
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
	tags?: string;
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
		// 3 = unrestricted (safe + moderate + restricted). ContactSheet is a
		// personal tool — no need to filter adult content.
		safe_search: '3',
		content_type: '1',
		media: 'photos',
		sort: opts.sort ?? 'relevance'
	};
	if (opts.text) params.text = opts.text;
	if (opts.userId) params.user_id = opts.userId;
	if (opts.tags) {
		params.tags = opts.tags;
		params.tag_mode = 'all';
	}
	return wrap(
		key('photos.search', {
			text: opts.text,
			user_id: opts.userId,
			tags: opts.tags,
			sort: opts.sort ?? 'relevance',
			page: opts.page ?? 1,
			per_page: opts.perPage ?? DEFAULT_PER_PAGE
		}),
		TTL,
		async () => {
			const res = await flickr<SearchResponse>({
				method: 'flickr.photos.search',
				params
			});
			return res.photos;
		}
	);
}
