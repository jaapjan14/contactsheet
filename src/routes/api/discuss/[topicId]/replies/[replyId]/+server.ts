import { error, json } from '@sveltejs/kit';
import { FlickrError } from '$lib/server/flickr/client';
import { resolveGroupId } from '$lib/server/flickr/groups';
import { deleteReply, editReply } from '$lib/server/flickr/discussions';
import type { RequestHandler } from './$types';

async function resolveGroupOr400(raw: unknown): Promise<string> {
	const groupParam = String(raw ?? '').trim();
	if (!groupParam) throw error(400, 'group_id is required');
	try {
		return await resolveGroupId(groupParam);
	} catch (err) {
		if (err instanceof FlickrError) throw error(404, `Group "${groupParam}" not found`);
		throw err;
	}
}

export const PATCH: RequestHandler = async ({ params, request }) => {
	const t0 = Date.now();
	let body: { message?: string; group_id?: string };
	try {
		body = (await request.json()) as { message?: string; group_id?: string };
	} catch {
		throw error(400, 'Invalid JSON');
	}
	const message = String(body.message ?? '').trim();
	if (!message) throw error(400, 'Empty reply');
	const groupId = await resolveGroupOr400(body.group_id);

	console.log(`[discuss.replies.edit] start topic=${params.topicId} reply=${params.replyId} group=${groupId} msgLen=${message.length}`);
	try {
		await editReply(params.topicId, params.replyId, groupId, message);
		const elapsed = Date.now() - t0;
		console.log(`[discuss.replies.edit] ok topic=${params.topicId} reply=${params.replyId} elapsed=${elapsed}ms`);
		return json({ ok: true });
	} catch (err) {
		const elapsed = Date.now() - t0;
		if (err instanceof FlickrError) {
			console.warn(`[discuss.replies.edit] flickr-error topic=${params.topicId} reply=${params.replyId} code=${err.code} msg="${err.message}" elapsed=${elapsed}ms`);
			return json({ error: err.message, code: err.code }, { status: 502 });
		}
		console.error(`[discuss.replies.edit] unknown-error topic=${params.topicId} reply=${params.replyId} elapsed=${elapsed}ms`, err);
		throw err;
	}
};

export const DELETE: RequestHandler = async ({ params, request, url }) => {
	const t0 = Date.now();
	// DELETE bodies are convention but not universally well-supported by
	// every fetch stack, so accept group_id from either body or query.
	let groupParam = url.searchParams.get('group_id') ?? '';
	if (!groupParam) {
		try {
			const body = (await request.json()) as { group_id?: string };
			groupParam = body.group_id ?? '';
		} catch {
			/* no body — fall through to error */
		}
	}
	const groupId = await resolveGroupOr400(groupParam);

	console.log(`[discuss.replies.delete] start topic=${params.topicId} reply=${params.replyId} group=${groupId}`);
	try {
		await deleteReply(params.topicId, params.replyId, groupId);
		const elapsed = Date.now() - t0;
		console.log(`[discuss.replies.delete] ok topic=${params.topicId} reply=${params.replyId} elapsed=${elapsed}ms`);
		return json({ ok: true });
	} catch (err) {
		const elapsed = Date.now() - t0;
		if (err instanceof FlickrError) {
			console.warn(`[discuss.replies.delete] flickr-error topic=${params.topicId} reply=${params.replyId} code=${err.code} msg="${err.message}" elapsed=${elapsed}ms`);
			return json({ error: err.message, code: err.code }, { status: 502 });
		}
		console.error(`[discuss.replies.delete] unknown-error topic=${params.topicId} reply=${params.replyId} elapsed=${elapsed}ms`, err);
		throw err;
	}
};
