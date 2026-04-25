import { error, json } from '@sveltejs/kit';
import { FlickrError } from '$lib/server/flickr/client';
import { flickrAuth } from '$lib/server/flickr/authenticated';
import { readAuth } from '$lib/server/auth/store';
import type { RequestHandler } from './$types';

interface SetMetaBody {
	title: string;
	description: string;
}

export const POST: RequestHandler = async ({ params, request }) => {
	const auth = await readAuth();
	if (!auth) throw error(401, 'Not signed in');

	let body: SetMetaBody;
	try {
		body = (await request.json()) as SetMetaBody;
	} catch {
		throw error(400, 'Invalid JSON body');
	}
	if (typeof body.title !== 'string' || typeof body.description !== 'string') {
		throw error(400, 'title and description must be strings');
	}
	if (body.title.length > 200) {
		throw error(400, 'title exceeds 200 characters');
	}

	try {
		await flickrAuth({
			method: 'flickr.photos.setMeta',
			params: {
				photo_id: params.id,
				title: body.title,
				description: body.description
			}
		});
	} catch (err) {
		if (err instanceof FlickrError) {
			// 1: photo not found, 2: not the owner, 99: insufficient perms
			if (err.code === 2 || err.code === 99) throw error(403, err.message);
			throw error(502, err.message);
		}
		throw err;
	}

	return json({ ok: true });
};
