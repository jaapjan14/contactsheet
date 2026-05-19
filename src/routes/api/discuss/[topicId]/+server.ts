import { error, json } from '@sveltejs/kit';
import { FlickrError } from '$lib/server/flickr/client';
import { resolveGroupId } from '$lib/server/flickr/groups';
import { deleteTopic, editTopic } from '$lib/server/flickr/discussions';
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
	let body: { subject?: string; message?: string; group_id?: string };
	try {
		body = (await request.json()) as {
			subject?: string;
			message?: string;
			group_id?: string;
		};
	} catch {
		throw error(400, 'Invalid JSON');
	}
	const subject = String(body.subject ?? '').trim();
	const message = String(body.message ?? '').trim();
	if (!subject || !message) throw error(400, 'subject and message are required');
	const groupId = await resolveGroupOr400(body.group_id);

	try {
		await editTopic(params.topicId, groupId, subject, message);
		return json({ ok: true });
	} catch (err) {
		if (err instanceof FlickrError) throw error(502, err.message);
		throw err;
	}
};

export const DELETE: RequestHandler = async ({ params, request, url }) => {
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

	try {
		await deleteTopic(params.topicId, groupId);
		return json({ ok: true });
	} catch (err) {
		if (err instanceof FlickrError) throw error(502, err.message);
		throw err;
	}
};
