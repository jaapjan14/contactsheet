import { flickrAuth, flickrMaybeSigned } from './authenticated';
import { wrap, key, delPrefix } from '$lib/server/cache';
import type {
	DiscussRepliesGetListResponse,
	DiscussTopicsGetListResponse,
	RepliesPage,
	TopicsPage
} from './types';

// Members-only / 18+ groups require the viewer to be authenticated to read
// the discussion list, so we go through flickrMaybeSigned (attaches Jacob's
// token if present, errors gracefully otherwise — the route catches and
// renders a "can't read discussions" notice rather than redirecting).
//
// Discussions move on the order of minutes for active groups but hours for
// slow ones; 5min topic-list TTL is the same cadence as the photo pool and
// good enough for both extremes. Reply lists are similar — a thread Jacob
// has open in a tab will refresh every 5min if he pages, which is fine.

const TTL_TOPICS = 5 * 60;
const TTL_REPLIES = 5 * 60;

const DEFAULT_TOPICS_PER_PAGE = 20;
const DEFAULT_REPLIES_PER_PAGE = 25;

export async function getGroupDiscussTopics(
	groupId: string,
	page = 1,
	perPage = DEFAULT_TOPICS_PER_PAGE
): Promise<TopicsPage> {
	return wrap(
		// TEMP DEBUG (2026-05-18): cache key suffix bumped to force cold fetch.
		key('groups.discuss.topics.getList.debug', { group_id: groupId, page, per_page: perPage }),
		TTL_TOPICS,
		async () => {
			const res = await flickrMaybeSigned<DiscussTopicsGetListResponse>({
				method: 'flickr.groups.discuss.topics.getList',
				params: {
					group_id: groupId,
					per_page: String(perPage),
					page: String(page)
				}
			});
			// TEMP DEBUG (2026-05-18): looking for a field on the topics-list
			// response that signals "discussions disabled" so we can show the
			// proactive notice without making the user attempt a post. Remove
			// once we have the answer.
			console.log(
				`[debug.topics.getList] group=${groupId} page=${page} raw=`,
				JSON.stringify(res.topics).slice(0, 600)
			);
			return {
				page: Number(res.topics.page) || page,
				pages: Number(res.topics.pages) || 0,
				per_page: Number(res.topics.per_page) || perPage,
				total: Number(res.topics.total) || 0,
				topic: res.topics.topic ?? []
			};
		}
	);
}

/**
 * Flickr's documented contract says `replies.getList` only needs `topic_id`,
 * but in practice the API returns "Topic not found" (code 1) on every call
 * unless `group_id` is also passed. This appears to be a long-standing bug in
 * the discussion endpoints — calling routes always know the group context, so
 * threading it through is cheap. Verified 2026-05-18 against the live API.
 */
export async function getDiscussTopicReplies(
	topicId: string,
	groupId: string,
	page = 1,
	perPage = DEFAULT_REPLIES_PER_PAGE
): Promise<RepliesPage> {
	return wrap(
		key('groups.discuss.replies.getList', {
			topic_id: topicId,
			group_id: groupId,
			page,
			per_page: perPage
		}),
		TTL_REPLIES,
		async () => {
			const res = await flickrMaybeSigned<DiscussRepliesGetListResponse>({
				method: 'flickr.groups.discuss.replies.getList',
				params: {
					topic_id: topicId,
					group_id: groupId,
					per_page: String(perPage),
					page: String(page)
				}
			});
			return {
				topic: res.replies.topic,
				page: Number(res.replies.page) || page,
				pages: Number(res.replies.pages) || 0,
				per_page: Number(res.replies.per_page) || perPage,
				total: Number(res.replies.total) || 0,
				reply: res.replies.reply ?? []
			};
		}
	);
}

// Write helpers ----------------------------------------------------------------
//
// All of these require an authenticated Flickr session (`flickrAuth`).
// They invalidate the broad topic-list / replies-list cache prefixes for the
// affected group/topic so the next render reflects the change. Note that
// per-page cache keys include the page number, so a coarse `delPrefix` is the
// safest way to make sure neither the first page nor any loaded subsequent
// pages serve stale data after a write.

function invalidateGroupTopics(groupId: string) {
	delPrefix(`groups.discuss.topics.getList|group_id=${groupId}`);
}

function invalidateTopicReplies(topicId: string) {
	delPrefix(`groups.discuss.replies.getList|topic_id=${topicId}`);
}

interface ReplyAddResponse {
	stat: string;
	reply?: { id?: string };
}

/**
 * Post a new reply to a topic. Returns the new reply's ID when Flickr
 * surfaces it (the response shape isn't 100% consistent across topic
 * versions — callers should treat the ID as optional and refetch the
 * thread to confirm placement).
 */
export async function addReply(
	topicId: string,
	groupId: string,
	message: string
): Promise<string | undefined> {
	const res = await flickrAuth<ReplyAddResponse>({
		method: 'flickr.groups.discuss.replies.add',
		params: { topic_id: topicId, message }
	});
	invalidateTopicReplies(topicId);
	invalidateGroupTopics(groupId);
	return res.reply?.id;
}

export async function editReply(
	topicId: string,
	replyId: string,
	groupId: string,
	message: string
): Promise<void> {
	await flickrAuth({
		method: 'flickr.groups.discuss.replies.edit',
		params: { topic_id: topicId, reply_id: replyId, message }
	});
	invalidateTopicReplies(topicId);
	invalidateGroupTopics(groupId);
}

export async function deleteReply(
	topicId: string,
	replyId: string,
	groupId: string
): Promise<void> {
	await flickrAuth({
		method: 'flickr.groups.discuss.replies.delete',
		params: { topic_id: topicId, reply_id: replyId }
	});
	invalidateTopicReplies(topicId);
	invalidateGroupTopics(groupId);
}

interface TopicAddResponse {
	stat: string;
	topic?: { id?: string };
}

/**
 * Post a new topic to a group's discussion board. Returns the new topic's
 * ID so the caller can redirect to its thread page.
 */
export async function addTopic(
	groupId: string,
	subject: string,
	message: string
): Promise<string | undefined> {
	const res = await flickrAuth<TopicAddResponse>({
		method: 'flickr.groups.discuss.topics.add',
		params: { group_id: groupId, subject, message }
	});
	invalidateGroupTopics(groupId);
	return res.topic?.id;
}

export async function editTopic(
	topicId: string,
	groupId: string,
	subject: string,
	message: string
): Promise<void> {
	await flickrAuth({
		method: 'flickr.groups.discuss.topics.edit',
		params: { topic_id: topicId, subject, message }
	});
	invalidateTopicReplies(topicId);
	invalidateGroupTopics(groupId);
}

export async function deleteTopic(topicId: string, groupId: string): Promise<void> {
	await flickrAuth({
		method: 'flickr.groups.discuss.topics.delete',
		params: { topic_id: topicId }
	});
	invalidateTopicReplies(topicId);
	invalidateGroupTopics(groupId);
}
