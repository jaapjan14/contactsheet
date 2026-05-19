import { flickrMaybeSigned } from './authenticated';
import { wrap, key } from '$lib/server/cache';
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
		key('groups.discuss.topics.getList', { group_id: groupId, page, per_page: perPage }),
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

export async function getDiscussTopicReplies(
	topicId: string,
	page = 1,
	perPage = DEFAULT_REPLIES_PER_PAGE
): Promise<RepliesPage> {
	return wrap(
		key('groups.discuss.replies.getList', { topic_id: topicId, page, per_page: perPage }),
		TTL_REPLIES,
		async () => {
			const res = await flickrMaybeSigned<DiscussRepliesGetListResponse>({
				method: 'flickr.groups.discuss.replies.getList',
				params: {
					topic_id: topicId,
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
