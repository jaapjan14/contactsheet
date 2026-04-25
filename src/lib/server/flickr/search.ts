import { flickr } from './client';
import type { PhotosPage } from './types';

const DEFAULT_PER_PAGE = 100;

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
		safe_search: '1',
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
	const res = await flickr<SearchResponse>({
		method: 'flickr.photos.search',
		params
	});
	return res.photos;
}
