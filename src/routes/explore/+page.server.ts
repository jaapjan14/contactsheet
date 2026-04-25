import { error } from '@sveltejs/kit';
import { FlickrError } from '$lib/server/flickr/client';
import { getExplore } from '$lib/server/flickr/explore';
import type { PageServerLoad } from './$types';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const load: PageServerLoad = async ({ url }) => {
	const dateParam = url.searchParams.get('date')?.trim();
	const date = dateParam && DATE_RE.test(dateParam) ? dateParam : undefined;
	try {
		const photos = await getExplore(date, 1);
		return { date: date ?? null, photos };
	} catch (err) {
		if (err instanceof FlickrError) throw error(502, err.message);
		throw err;
	}
};
