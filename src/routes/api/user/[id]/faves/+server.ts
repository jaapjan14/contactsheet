import { error, json } from '@sveltejs/kit';
import { FlickrError } from '$lib/server/flickr/client';
import { resolveUserId } from '$lib/server/flickr/users';
import { getFavesPage } from '$lib/server/flickr/sorted';
import { pickSort } from '$lib/sort';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, url }) => {
	const page = Math.max(1, Number(url.searchParams.get('page') ?? '1'));
	const sort = pickSort('faves', url.searchParams.get('sort'), null);

	let userId: string;
	try {
		userId = await resolveUserId(params.id);
	} catch (err) {
		if (err instanceof FlickrError) throw error(404, `User "${params.id}" not found`);
		throw err;
	}

	try {
		const faves = await getFavesPage(userId, sort, page);
		return json(faves);
	} catch (err) {
		if (err instanceof FlickrError) throw error(502, err.message);
		throw err;
	}
};
