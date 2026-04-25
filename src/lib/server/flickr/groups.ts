import { flickr } from './client';
import { flickrAuth } from './authenticated';
import type {
	GroupsGetInfoResponse,
	GroupsPoolGetPhotosResponse,
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
 * `flickr.people.getGroups` requires authentication even for reading public info,
 * so this delegates to flickrAuth — which redirects to /auth/start if the
 * viewer isn't signed in.
 */
export async function getUserGroups(userId: string): Promise<FlickrUserGroup[]> {
	const res = await flickrAuth<PeopleGetGroupsResponse>({
		method: 'flickr.people.getGroups',
		params: { user_id: userId }
	});
	return res.groups.group ?? [];
}

const DEFAULT_PER_PAGE = 100;
const NSID_RE = /^\d+@N\d+$/;
const groupIdCache = new Map<string, string>();

/**
 * Resolve a group path-alias or NSID to a stable NSID.
 */
export async function resolveGroupId(input: string): Promise<string> {
	const trimmed = input.trim();
	if (NSID_RE.test(trimmed)) return trimmed;

	const cached = groupIdCache.get(trimmed);
	if (cached) return cached;

	const res = await flickr<UrlsLookupGroupResponse>({
		method: 'flickr.urls.lookupGroup',
		params: { url: `https://www.flickr.com/groups/${trimmed}/` }
	});
	groupIdCache.set(trimmed, res.group.id);
	return res.group.id;
}

export async function getGroupInfo(groupId: string): Promise<FlickrGroupInfo> {
	const res = await flickr<GroupsGetInfoResponse>({
		method: 'flickr.groups.getInfo',
		params: { group_id: groupId }
	});
	return res.group;
}

export async function getGroupPhotos(
	groupId: string,
	page = 1,
	perPage = DEFAULT_PER_PAGE
): Promise<PhotosPage> {
	const res = await flickr<GroupsPoolGetPhotosResponse>({
		method: 'flickr.groups.pools.getPhotos',
		params: {
			group_id: groupId,
			per_page: String(perPage),
			page: String(page),
			extras: 'date_taken,views,o_dims,owner_name'
		}
	});
	return res.photos;
}
