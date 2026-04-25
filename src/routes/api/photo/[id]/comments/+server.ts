import { error, json } from '@sveltejs/kit';
import { FlickrError } from '$lib/server/flickr/client';
import { flickrAuth } from '$lib/server/flickr/authenticated';
import { del, key } from '$lib/server/cache';
import type { RequestHandler } from './$types';

interface AddCommentResponse {
	stat: string;
	comment: { id: string; _content?: string };
}

export const POST: RequestHandler = async ({ params, request }) => {
	let body: { text?: string };
	try {
		body = (await request.json()) as { text?: string };
	} catch {
		throw error(400, 'Invalid JSON');
	}
	const text = String(body.text ?? '').trim();
	if (!text) throw error(400, 'Empty comment');

	try {
		const res = await flickrAuth<AddCommentResponse>({
			method: 'flickr.photos.comments.addComment',
			params: { photo_id: params.id, comment_text: text }
		});
		// Drop the cached comment list so the next reload pulls the real entry
		del(key('photos.comments', { photo_id: params.id }));
		return json({ ok: true, commentId: res.comment.id });
	} catch (err) {
		if (err instanceof FlickrError) throw error(502, err.message);
		throw err;
	}
};
