import { error, json } from '@sveltejs/kit';
import { FlickrError } from '$lib/server/flickr/client';
import { resolveUserId } from '$lib/server/flickr/users';
import { searchPhotos, type SearchSort } from '$lib/server/flickr/search';
import type { RequestHandler } from './$types';

const VALID_SORTS: SearchSort[] = [
	'relevance',
	'date-posted-desc',
	'date-posted-asc',
	'date-taken-desc',
	'date-taken-asc',
	'interestingness-desc',
	'interestingness-asc'
];

export const GET: RequestHandler = async ({ url }) => {
	const page = Math.max(1, Number(url.searchParams.get('page') ?? '1'));
	const q = url.searchParams.get('q')?.trim();
	const user = url.searchParams.get('user')?.trim();
	const tags = url.searchParams.get('tags')?.trim();
	const sortParam = url.searchParams.get('sort') ?? 'relevance';
	const sort: SearchSort = (VALID_SORTS as string[]).includes(sortParam)
		? (sortParam as SearchSort)
		: 'relevance';

	if (!q && !user && !tags) {
		throw error(400, 'At least one of q, user, or tags is required');
	}

	let userId: string | undefined;
	if (user) {
		try {
			userId = await resolveUserId(user);
		} catch (err) {
			if (err instanceof FlickrError) throw error(404, `User "${user}" not found`);
			throw err;
		}
	}

	try {
		const photos = await searchPhotos({
			text: q || undefined,
			userId,
			tags: tags || undefined,
			sort,
			page
		});
		return json(photos);
	} catch (err) {
		if (err instanceof FlickrError) throw error(502, err.message);
		throw err;
	}
};
