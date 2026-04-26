import { error } from '@sveltejs/kit';
import { FlickrError } from '$lib/server/flickr/client';
import { resolveUserId } from '$lib/server/flickr/users';
import { searchPhotos, type SearchSort } from '$lib/server/flickr/search';
import { searchGroups } from '$lib/server/flickr/groups';
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
			groups: null,
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

	// Run photo + group searches in parallel. Groups only make sense for
	// free-text queries (no group equivalent of "by user X" / "tagged Y"),
	// and we treat group failures as best-effort so a Flickr hiccup on the
	// groups call doesn't kill the entire results page.
	const [photos, groups] = await Promise.all([
		searchPhotos({
			text: q || undefined,
			userId,
			tags: tags || undefined,
			sort,
			page: 1
		}),
		q ? searchGroups(q, 1, 12).catch(() => null) : Promise.resolve(null)
	]);

	return {
		query: { q, user, tags, sort },
		photos,
		groups,
		userResolved: userId ?? null
	};
};
