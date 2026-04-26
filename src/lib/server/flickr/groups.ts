import { flickr } from './client';
import { flickrMaybeSigned } from './authenticated';
import { wrap, key } from '$lib/server/cache';
import type {
	GroupsGetInfoResponse,
	GroupsPoolGetPhotosResponse,
	GroupsSearchResponse,
	GroupsPage,
	UrlsLookupGroupResponse,
	FlickrGroupInfo,
	PhotosPage
} from './types';

export interface FlickrUserGroup {
	nsid: string;
	name: string;
	eighteenplus?: number;
	admin?: number;
	invitation_only?: number;
}

interface PeopleGetGroupsResponse {
	stat: string;
	groups: { group: FlickrUserGroup[] };
}

/**
 * `flickr.people.getGroups` requires authentication. We delegate to
 * flickrMaybeSigned so authed sessions get the list, and unsigned sessions
 * get a Flickr error that the route can catch and render gracefully —
 * rather than the old behavior of forcibly redirecting to Flickr OAuth on
 * every Groups-tab click. Cached 5 minutes.
 */
export async function getUserGroups(userId: string): Promise<FlickrUserGroup[]> {
	return wrap(key('people.getGroups', { user_id: userId }), TTL_USER_GROUPS, async () => {
		const res = await flickrMaybeSigned<PeopleGetGroupsResponse>({
			method: 'flickr.people.getGroups',
			params: { user_id: userId }
		});
		return res.groups.group ?? [];
	});
}

const DEFAULT_PER_PAGE = 100;
const NSID_RE = /^\d+@N\d+$/;
const TTL_RESOLVE = 30 * 24 * 60 * 60;
const TTL_INFO = 24 * 60 * 60;
const TTL_POOL = 5 * 60;
const TTL_USER_GROUPS = 5 * 60;
const TTL_GROUP_SEARCH = 10 * 60;

/**
 * Search Flickr groups by free text. Cached 10 minutes per query/page combo —
 * groups don't change rapidly and even short cache massively cuts API load
 * when a search-page user paginates back and forth.
 */
export async function searchGroups(
	text: string,
	page = 1,
	perPage = 24
): Promise<GroupsPage> {
	return wrap(
		key('groups.search', { text, page, per_page: perPage }),
		TTL_GROUP_SEARCH,
		async () => {
			const res = await flickr<GroupsSearchResponse>({
				method: 'flickr.groups.search',
				params: {
					text,
					per_page: String(perPage),
					page: String(page)
				}
			});
			return res.groups;
		}
	);
}

/**
 * Resolve a group path-alias or NSID to a stable NSID. Cached 30 days.
 */
export async function resolveGroupId(input: string): Promise<string> {
	const trimmed = input.trim();
	if (NSID_RE.test(trimmed)) return trimmed;

	return wrap(key('resolveGroupId', { input: trimmed }), TTL_RESOLVE, async () => {
		const res = await flickr<UrlsLookupGroupResponse>({
			method: 'flickr.urls.lookupGroup',
			params: { url: `https://www.flickr.com/groups/${trimmed}/` }
		});
		return res.group.id;
	});
}

/**
 * Group info uses a maybe-signed call: some groups (private, members-only,
 * 18+) require the viewer to be a member to read their info, in which case
 * Flickr returns "Group not found" / "Permission denied" for unsigned
 * requests. flickrMaybeSigned attaches Jacob's token if present.
 */
export async function getGroupInfo(groupId: string): Promise<FlickrGroupInfo> {
	return wrap(key('groups.getInfo', { group_id: groupId }), TTL_INFO, async () => {
		const res = await flickrMaybeSigned<GroupsGetInfoResponse>({
			method: 'flickr.groups.getInfo',
			params: { group_id: groupId }
		});
		return res.group;
	});
}

/**
 * Group pool: same maybe-signed deal. Private pools require the caller to
 * be a member; signed call lets Jacob read the pools of every group he
 * belongs to. Non-member private pools still 4xx — handle gracefully in the route.
 */
export async function getGroupPhotos(
	groupId: string,
	page = 1,
	perPage = DEFAULT_PER_PAGE
): Promise<PhotosPage> {
	return wrap(
		key('groups.pools.getPhotos', { group_id: groupId, page, per_page: perPage }),
		TTL_POOL,
		async () => {
			const res = await flickrMaybeSigned<GroupsPoolGetPhotosResponse>({
				method: 'flickr.groups.pools.getPhotos',
				params: {
					group_id: groupId,
					per_page: String(perPage),
					page: String(page),
					safe_search: '3',
					extras: 'date_taken,views,o_dims,owner_name'
				}
			});
			return res.photos;
		}
	);
}
