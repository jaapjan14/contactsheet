import { flickrAuth } from './authenticated';
import type { FlickrPhotoSummary } from './types';

interface TotalViewsResponse {
	stat: string;
	stats: {
		total: { views: string };
		photos?: { views: string };
		photostream?: { views: string };
		sets?: { views: string };
		collections?: { views: string };
		photoset?: { views: string };
		galleries?: { views: string };
	};
}

interface PopularPhoto extends FlickrPhotoSummary {
	stats?: {
		views: string;
		comments: string;
		favorites: string;
	};
	count_views?: string;
	count_comments?: string;
	count_faves?: string;
}

interface PopularPhotosResponse {
	stat: string;
	photos: {
		page: number;
		pages: number;
		perpage: number;
		total: number | string;
		photo: PopularPhoto[];
	};
}

export async function getTotalViews(): Promise<TotalViewsResponse['stats']> {
	const res = await flickrAuth<TotalViewsResponse>({
		method: 'flickr.stats.getTotalViews',
		params: {}
	});
	return res.stats;
}

export async function getPopularPhotos(
	perPage = 12
): Promise<PopularPhotosResponse['photos']> {
	const res = await flickrAuth<PopularPhotosResponse>({
		method: 'flickr.stats.getPopularPhotos',
		params: {
			sort: 'views',
			per_page: String(perPage),
			page: '1'
		}
	});
	return res.photos;
}
