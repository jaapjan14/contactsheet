import { error, json } from '@sveltejs/kit';
import { FlickrError } from '$lib/server/flickr/client';
import { resolveGroupId } from '$lib/server/flickr/groups';
import { addReply, getDiscussTopicReplies } from '$lib/server/flickr/discussions';
import type { RequestHandler } from './$types';

// `group_id` is required because Flickr's replies.getList silently 404s
// without it — see comment in `discussions.ts`. The client passes the
// already-resolved NSID it has from page state; the resolveGroupId fallback
// covers path-alias values just in case.
export const GET: RequestHandler = async ({ params, url }) => {
	const page = Math.max(1, Number(url.searchParams.get('page') ?? '1'));
	const groupParam = (url.searchParams.get('group_id') ?? '').trim();
	if (!groupParam) throw error(400, 'group_id query parameter is required');

	let groupId: string;
	try {
		groupId = await resolveGroupId(groupParam);
	} catch (err) {
		if (err instanceof FlickrError) throw error(404, `Group "${groupParam}" not found`);
		throw err;
	}

	try {
		const replies = await getDiscussTopicReplies(params.topicId, groupId, page);
		return json(replies);
	} catch (err) {
		if (err instanceof FlickrError) throw error(502, err.message);
		throw err;
	}
};

export const POST: RequestHandler = async ({ params, request }) => {
	let body: { message?: string; group_id?: string };
	try {
		body = (await request.json()) as { message?: string; group_id?: string };
	} catch {
		throw error(400, 'Invalid JSON');
	}
	const message = String(body.message ?? '').trim();
	if (!message) throw error(400, 'Empty reply');
	const groupParam = String(body.group_id ?? '').trim();
	if (!groupParam) throw error(400, 'group_id is required');

	let groupId: string;
	try {
		groupId = await resolveGroupId(groupParam);
	} catch (err) {
		if (err instanceof FlickrError) throw error(404, `Group "${groupParam}" not found`);
		throw err;
	}

	try {
		const replyId = await addReply(params.topicId, groupId, message);
		return json({ ok: true, replyId });
	} catch (err) {
		if (err instanceof FlickrError) {
			return json({ error: err.message, code: err.code }, { status: 502 });
		}
		throw err;
	}
};
