import { error, json } from '@sveltejs/kit';
import { FlickrError } from '$lib/server/flickr/client';
import { getExplore } from '$lib/server/flickr/explore';
import type { RequestHandler } from './$types';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const GET: RequestHandler = async ({ url }) => {
	const page = Math.max(1, Number(url.searchParams.get('page') ?? '1'));
	const dateParam = url.searchParams.get('date')?.trim();
	const date = dateParam && DATE_RE.test(dateParam) ? dateParam : undefined;
	try {
		const photos = await getExplore(date, page);
		return json(photos);
	} catch (err) {
		if (err instanceof FlickrError) throw error(502, err.message);
		throw err;
	}
};
