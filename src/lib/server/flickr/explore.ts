import { flickr } from './client';
import { wrap, key } from '$lib/server/cache';
import type { PhotosPage } from './types';

const DEFAULT_PER_PAGE = 100;
const TTL_TODAY = 5 * 60; // 5 minutes — today's interestingness can shift
const TTL_PAST = 24 * 60 * 60; // 1 day — past dates are stable

interface InterestingnessResponse {
	stat: string;
	photos: PhotosPage;
}

/**
 * Flickr Explore — `flickr.interestingness.getList`. Without a `date`
 * param, returns the most recent fully-computed list (yesterday).
 */
export async function getExplore(
	date: string | undefined,
	page = 1,
	perPage = DEFAULT_PER_PAGE
): Promise<PhotosPage> {
	const today = new Date().toISOString().slice(0, 10);
	const isToday = !date || date === today;
	const ttl = isToday ? TTL_TODAY : TTL_PAST;

	return wrap(
		key('interestingness.getList', { date: date ?? '_latest', page, per_page: perPage }),
		ttl,
		async () => {
			const params: Record<string, string> = {
				per_page: String(perPage),
				page: String(page),
				extras: 'date_taken,views,o_dims,owner_name,path_alias'
			};
			if (date) params.date = date;
			const res = await flickr<InterestingnessResponse>({
				method: 'flickr.interestingness.getList',
				params
			});
			return res.photos;
		}
	);
}
