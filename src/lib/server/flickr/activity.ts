import { flickrAuth } from './authenticated';

// flickr.activity.userPhotos returns recent activity (faves, comments,
// notes) on photos owned by the authenticated user. We never cache it —
// the poller is the only caller and it wants fresh results every tick.

export interface ActivityEvent {
	type: 'fave' | 'comment' | 'note' | string;
	user: string;
	username: string;
	dateadded: string; // unix seconds
	commentid?: string;
	_content?: string; // comment body, when type === 'comment'
}

export interface ActivityItem {
	type: 'photo' | string;
	id: string;
	secret: string;
	server: string;
	farm: number;
	owner: string;
	ownername: string;
	title: { _content: string };
	activity: { event: ActivityEvent[] | ActivityEvent };
}

interface ActivityUserPhotosResponse {
	stat: string;
	items: { item: ActivityItem[] };
}

/**
 * Recent activity on the signed-in user's photos.
 * `timeframe` accepts Flickr's compact form: e.g. '1d', '7d', '30d'.
 */
export async function getUserPhotosActivity(
	timeframe: string = '7d',
	perPage = 50
): Promise<ActivityItem[]> {
	const res = await flickrAuth<ActivityUserPhotosResponse>({
		method: 'flickr.activity.userPhotos',
		params: { timeframe, per_page: String(perPage) }
	});
	return res.items?.item ?? [];
}
