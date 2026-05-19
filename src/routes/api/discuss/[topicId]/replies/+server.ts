import { error, json } from '@sveltejs/kit';
import { FlickrError } from '$lib/server/flickr/client';
import { getDiscussTopicReplies } from '$lib/server/flickr/discussions';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, url }) => {
	const page = Math.max(1, Number(url.searchParams.get('page') ?? '1'));

	try {
		const replies = await getDiscussTopicReplies(params.topicId, page);
		return json(replies);
	} catch (err) {
		if (err instanceof FlickrError) throw error(502, err.message);
		throw err;
	}
};
