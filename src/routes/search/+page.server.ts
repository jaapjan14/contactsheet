import { error } from '@sveltejs/kit';
import { FlickrError } from '$lib/server/flickr/client';
import { resolveUserId } from '$lib/server/flickr/users';
import { searchPhotos, type SearchSort } from '$lib/server/flickr/search';
import type { PageServerLoad } from './$types';

const VALID_SORTS: SearchSort[] = [
	'relevance',
	'date-posted-desc',
	'date-posted-asc',
	'date-taken-desc',
	'date-taken-asc',
	'interestingness-desc',
	'interestingness-asc'
];

export const load: PageServerLoad = async ({ url }) => {
	const q = (url.searchParams.get('q') ?? '').trim();
	const user = (url.searchParams.get('user') ?? '').trim();
	const tags = (url.searchParams.get('tags') ?? '').trim();
	const sortParam = url.searchParams.get('sort') ?? 'relevance';
	const sort: SearchSort = (VALID_SORTS as string[]).includes(sortParam)
		? (sortParam as SearchSort)
		: 'relevance';

	if (!q && !user && !tags) {
		return {
			query: { q: '', user: '', tags: '', sort },
			photos: null,
			userResolved: null
		};
	}

	let userId: string | undefined;
	if (user) {
		try {
			userId = await resolveUserId(user);
		} catch (err) {
			if (err instanceof FlickrError) {
				throw error(404, `User "${user}" not found on Flickr`);
			}
			throw err;
		}
	}

	const photos = await searchPhotos({
		text: q || undefined,
		userId,
		tags: tags || undefined,
		sort,
		page: 1
	});

	return {
		query: { q, user, tags, sort },
		photos,
		userResolved: userId ?? null
	};
};
