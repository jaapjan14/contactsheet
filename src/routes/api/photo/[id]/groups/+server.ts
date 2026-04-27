import { error, json } from '@sveltejs/kit';
import { FlickrError } from '$lib/server/flickr/client';
import { readAuth } from '$lib/server/auth/store';
import { addPhotoToGroup, resolveGroupId } from '$lib/server/flickr/groups';
import type { RequestHandler } from './$types';

interface AddBody {
	groupId: string;
}

export const POST: RequestHandler = async ({ params, request }) => {
	const auth = await readAuth();
	if (!auth) throw error(401, 'Not signed in');

	let body: AddBody;
	try {
		body = (await request.json()) as AddBody;
	} catch {
		throw error(400, 'Invalid JSON body');
	}
	if (typeof body.groupId !== 'string' || !body.groupId.trim()) {
		throw error(400, 'groupId is required');
	}

	let resolvedGroupId: string;
	try {
		resolvedGroupId = await resolveGroupId(body.groupId);
	} catch (err) {
		if (err instanceof FlickrError) throw error(404, `Group "${body.groupId}" not found`);
		throw err;
	}

	try {
		await addPhotoToGroup(params.id, resolvedGroupId);
		return json({ ok: true, groupId: resolvedGroupId });
	} catch (err) {
		if (err instanceof FlickrError) {
			// 3 = photo already in pool — fold into success so optimistic UI stays consistent.
			if (err.code === 3) {
				return json({ ok: true, groupId: resolvedGroupId, alreadyIn: true });
			}
			// 7 = photo queued for moderator approval. Not in the pool yet but the
			// add was accepted — surface so the UI can say "submitted for review".
			if (err.code === 7) {
				return json({ ok: true, groupId: resolvedGroupId, queued: true });
			}
			// 5 = photo limit reached, 6 = throttled, 8 = pool full, others — pass through
			throw error(502, err.message);
		}
		throw err;
	}
};
