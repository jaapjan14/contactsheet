import { error, json } from '@sveltejs/kit';
import { FlickrError } from '$lib/server/flickr/client';
import { resolveGroupId } from '$lib/server/flickr/groups';
import { addTopic, getGroupDiscussTopics } from '$lib/server/flickr/discussions';
import type { RequestHandler } from './$types';

async function resolveOr404(input: string): Promise<string> {
	try {
		return await resolveGroupId(input);
	} catch (err) {
		if (err instanceof FlickrError) throw error(404, `Group "${input}" not found`);
		throw err;
	}
}

export const GET: RequestHandler = async ({ params, url }) => {
	const page = Math.max(1, Number(url.searchParams.get('page') ?? '1'));
	const groupId = await resolveOr404(params.id);

	try {
		const topics = await getGroupDiscussTopics(groupId, page);
		return json(topics);
	} catch (err) {
		if (err instanceof FlickrError) throw error(502, err.message);
		throw err;
	}
};

export const POST: RequestHandler = async ({ params, request }) => {
	const t0 = Date.now();
	let body: { subject?: string; message?: string };
	try {
		body = (await request.json()) as { subject?: string; message?: string };
	} catch {
		throw error(400, 'Invalid JSON');
	}
	const subject = String(body.subject ?? '').trim();
	const message = String(body.message ?? '').trim();
	if (!subject) throw error(400, 'Subject is required');
	if (!message) throw error(400, 'Message is required');

	const groupId = await resolveOr404(params.id);
	console.log(`[discuss.topics.add] start group=${groupId} subject="${subject.slice(0, 60)}" msgLen=${message.length}`);

	try {
		const topicId = await addTopic(groupId, subject, message);
		const elapsed = Date.now() - t0;
		console.log(`[discuss.topics.add] ok group=${groupId} topicId=${topicId} elapsed=${elapsed}ms`);
		return json({ ok: true, topicId });
	} catch (err) {
		const elapsed = Date.now() - t0;
		if (err instanceof FlickrError) {
			console.warn(`[discuss.topics.add] flickr-error group=${groupId} code=${err.code} msg="${err.message}" elapsed=${elapsed}ms`);
			return json(
				{ error: err.message, code: err.code },
				{ status: 502 }
			);
		}
		console.error(`[discuss.topics.add] unknown-error group=${groupId} elapsed=${elapsed}ms`, err);
		throw err;
	}
};
