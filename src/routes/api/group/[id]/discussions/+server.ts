import { error, json } from '@sveltejs/kit';
import { FlickrError } from '$lib/server/flickr/client';
import { resolveGroupId } from '$lib/server/flickr/groups';
import { getGroupDiscussTopics } from '$lib/server/flickr/discussions';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, url }) => {
	const page = Math.max(1, Number(url.searchParams.get('page') ?? '1'));

	let groupId: string;
	try {
		groupId = await resolveGroupId(params.id);
	} catch (err) {
		if (err instanceof FlickrError) throw error(404, `Group "${params.id}" not found`);
		throw err;
	}

	try {
		const topics = await getGroupDiscussTopics(groupId, page);
		return json(topics);
	} catch (err) {
		if (err instanceof FlickrError) throw error(502, err.message);
		throw err;
	}
};
