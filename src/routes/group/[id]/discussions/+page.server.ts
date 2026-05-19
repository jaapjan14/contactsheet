import { error } from '@sveltejs/kit';
import { FlickrError } from '$lib/server/flickr/client';
import { resolveGroupId, getGroupInfo } from '$lib/server/flickr/groups';
import { getGroupDiscussTopics } from '$lib/server/flickr/discussions';
import type { TopicsPage } from '$lib/server/flickr/types';
import type { PageServerLoad } from './$types';

const EMPTY_TOPICS: TopicsPage = {
	page: 1,
	pages: 0,
	per_page: 20,
	total: 0,
	topic: []
};

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

	let info;
	try {
		info = await getGroupInfo(groupId);
	} catch (err) {
		if (err instanceof FlickrError) {
			throw error(404, `Can't read group "${params.id}": ${err.message}`);
		}
		throw err;
	}

	// Discussions may be inaccessible (members-only group + not a member, or
	// an admin disabled them). Render the page with a notice rather than 404
	// so the tab strip is still navigable.
	let topics: TopicsPage = EMPTY_TOPICS;
	let topicsError: string | null = null;
	try {
		topics = await getGroupDiscussTopics(groupId, 1);
	} catch (err) {
		if (err instanceof FlickrError) {
			topicsError = err.message;
		} else {
			throw err;
		}
	}

	// Detect Flickr's "Discussions disabled for this group" state. Flickr
	// doesn't expose an explicit flag in `groups.getInfo`, but it surfaces the
	// state as a discrepancy: the group profile keeps reporting `topic_count`
	// from before discussions were turned off, while `topics.getList` returns
	// `total: 0` and an empty page. Verified 2026-05-18 against a real group
	// where Flickr's own UI showed "Discussions are disabled for this group."
	// This heuristic also catches "all topics deleted but discussions still
	// enabled" — rare enough that the same UI treatment is acceptable.
	const profiledTopicCount = Number(info.topic_count?._content ?? '0') || 0;
	const discussionsDisabled =
		!topicsError && profiledTopicCount > 0 && topics.total === 0;

	return {
		groupKey: params.id,
		groupId,
		group: info,
		topics,
		topicsError,
		discussionsDisabled
	};
};
