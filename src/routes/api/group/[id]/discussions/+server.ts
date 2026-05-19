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

	try {
		const topicId = await addTopic(groupId, subject, message);
		return json({ ok: true, topicId });
	} catch (err) {
		// Return a JSON error body so the client's errorFrom() can show
		// Flickr's actual message ("Discussions are disabled for this group",
		// "Insufficient permissions", etc.) instead of a generic "took too long."
		// `throw error()` serves an HTML page when Accept isn't json, which is
		// what fetch() defaults to.
		if (err instanceof FlickrError) {
			return json(
				{ error: err.message, code: err.code },
				{ status: 502 }
			);
		}
		throw err;
	}
};
