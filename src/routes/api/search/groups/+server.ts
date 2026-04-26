import { error, json } from '@sveltejs/kit';
import { FlickrError } from '$lib/server/flickr/client';
import { searchGroups } from '$lib/server/flickr/groups';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url }) => {
	const text = url.searchParams.get('q')?.trim();
	const page = Math.max(1, Number(url.searchParams.get('page') ?? '1'));
	if (!text) throw error(400, 'q is required');

	try {
		const groups = await searchGroups(text, page, 24);
		return json(groups);
	} catch (err) {
		if (err instanceof FlickrError) throw error(502, err.message);
		throw err;
	}
};
