import { flickr } from './client';
import type {
	GroupsGetInfoResponse,
	GroupsPoolGetPhotosResponse,
	UrlsLookupGroupResponse,
	FlickrGroupInfo,
	PhotosPage
} from './types';

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
