import { error } from '@sveltejs/kit';
import { FlickrError } from '$lib/server/flickr/client';
import { resolveGroupId, getGroupInfo } from '$lib/server/flickr/groups';
import { getDiscussTopicReplies } from '$lib/server/flickr/discussions';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
	let groupId: string;
	try {
		groupId = await resolveGroupId(params.id);
	} catch (err) {
		if (err instanceof FlickrError) {
			throw error(404, `Group "${params.id}" not found on Flickr`);
		}
		throw err;
	}

	// Load the group header in parallel with the first page of replies. The
	// replies response carries the topic head (subject + OP body) so we don't
	// need a separate getTopicInfo call.
	const [info, replies] = await Promise.all([
		getGroupInfo(groupId).catch((err: unknown) => {
			if (err instanceof FlickrError) return null;
			throw err;
		}),
		getDiscussTopicReplies(params.topicId, groupId, 1).catch((err: unknown) => {
			if (err instanceof FlickrError) {
				throw error(404, `Can't read this topic: ${err.message}`);
			}
			throw err;
		})
	]);

	if (!info) {
		throw error(404, `Can't read group "${params.id}"`);
	}

	return {
		groupKey: params.id,
		groupId,
		group: info,
		topicId: params.topicId,
		replies
	};
};
