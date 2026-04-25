import { error, json } from '@sveltejs/kit';
import { FlickrError } from '$lib/server/flickr/client';
import { flickrAuth } from '$lib/server/flickr/authenticated';
import { del, delPrefix, key } from '$lib/server/cache';
import type { RequestHandler } from './$types';

function invalidate(photoId: string) {
	// Drop the user's own faves list (every page) and this photo's count
	delPrefix('favorites.getList|');
	del(key('photos.favoritesCount', { photo_id: photoId }));
}

export const POST: RequestHandler = async ({ params }) => {
	try {
		await flickrAuth({
			method: 'flickr.favorites.add',
			params: { photo_id: params.id }
		});
		invalidate(params.id);
		return json({ ok: true });
	} catch (err) {
		if (err instanceof FlickrError) {
			// Code 3 = "Photo already in favorites" — fold into success
			if (err.code === 3) {
				invalidate(params.id);
				return json({ ok: true, alreadyFaved: true });
			}
			throw error(502, err.message);
		}
		throw err;
	}
};

export const DELETE: RequestHandler = async ({ params }) => {
	try {
		await flickrAuth({
			method: 'flickr.favorites.remove',
			params: { photo_id: params.id }
		});
		invalidate(params.id);
		return json({ ok: true });
	} catch (err) {
		if (err instanceof FlickrError) {
			// Code 4 = "Photo not in user's favorites" — fold into success
			if (err.code === 4) {
				invalidate(params.id);
				return json({ ok: true, notFaved: true });
			}
			throw error(502, err.message);
		}
		throw err;
	}
};
