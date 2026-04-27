import { error } from '@sveltejs/kit';
import { FlickrError } from '$lib/server/flickr/client';
import {
	getPhotoInfo,
	getPhotoSizes,
	getPhotoExif,
	getPhotoComments,
	getPhotoFavoritesCount,
	getPhotoContexts
} from '$lib/server/flickr/photos';
import { getUserGroups, type FlickrUserGroup } from '$lib/server/flickr/groups';
import { readAuth } from '$lib/server/auth/store';
import type { FlickrSizeEntry } from '$lib/server/flickr/types';
import type { PageServerLoad } from './$types';

const TARGET_DISPLAY_WIDTH = 2048;

function pickDisplaySize(sizes: FlickrSizeEntry[]): FlickrSizeEntry | null {
	const photoSizes = sizes.filter((s) => s.media === 'photo');
	if (photoSizes.length === 0) return null;
	const sorted = [...photoSizes].sort((a, b) => a.width - b.width);
	const fit = sorted.filter((s) => s.width <= TARGET_DISPLAY_WIDTH).pop();
	return fit ?? sorted[sorted.length - 1];
}

/**
 * Mid-tier high-res for the zoom/fullscreen swap. The viewer uses a two-tier
 * progressive enhancement: this fires first because it's 1–3 MB and lands in
 * about a second, giving an immediate sharpness boost. Order of preference:
 *   6K → 5K → 4K → 3K → biggest non-Original → null
 */
function pickHighResSize(sizes: FlickrSizeEntry[], display: FlickrSizeEntry): FlickrSizeEntry | null {
	const photoSizes = sizes.filter((s) => s.media === 'photo');
	if (photoSizes.length === 0) return null;

	const nonOriginal = photoSizes.filter((s) => s.label !== 'Original');
	const preferred = ['X-Large 6K', 'X-Large 5K', 'X-Large 4K', 'X-Large 3K'];
	for (const label of preferred) {
		const hit = nonOriginal.find((s) => s.label === label);
		if (hit && hit.width > display.width) return hit;
	}
	const biggestNonOriginal = [...nonOriginal].sort((a, b) => b.width - a.width)[0];
	if (biggestNonOriginal && biggestNonOriginal.width > display.width) {
		return biggestNonOriginal;
	}
	return null;
}

/**
 * Top-tier "Original" — only present when Flickr exposes it (owner OR uploader
 * allowed downloads). Big (often 15–40 MB) so it loads in the background AFTER
 * the mid-tier swap. This lets us match Flickr's own viewer pixel-for-pixel
 * while not blocking the initial sharpness boost behind a long download.
 * Returns null when no Original is offered or it isn't bigger than highRes.
 */
function pickMaxResSize(
	sizes: FlickrSizeEntry[],
	highRes: FlickrSizeEntry | null
): FlickrSizeEntry | null {
	const original = sizes.find((s) => s.media === 'photo' && s.label === 'Original');
	if (!original) return null;
	if (highRes && original.width <= highRes.width) return null;
	return original;
}

export const load: PageServerLoad = async ({ params }) => {
	try {
		const auth = await readAuth();
		const [photo, sizes, exif, comments, favesCount, contexts, myGroups] = await Promise.all([
			getPhotoInfo(params.id),
			getPhotoSizes(params.id),
			getPhotoExif(params.id),
			getPhotoComments(params.id),
			getPhotoFavoritesCount(params.id),
			getPhotoContexts(params.id),
			auth ? getUserGroups(auth.nsid).catch((): FlickrUserGroup[] => []) : Promise.resolve([] as FlickrUserGroup[])
		]);

		const display = pickDisplaySize(sizes);
		if (!display) throw error(404, 'No displayable sizes for this photo');
		const highRes = pickHighResSize(sizes, display);
		const maxRes = pickMaxResSize(sizes, highRes);

		// Photo-media sizes only — used by the BBCode share picker. Drop video
		// renditions (they have media === 'video') so the menu is clean.
		const photoSizes = sizes.filter((s) => s.media === 'photo');

		return {
			photo,
			display,
			highRes,
			maxRes,
			photoSizes,
			exif,
			comments,
			favesCount,
			contexts,
			myGroups
		};
	} catch (err) {
		if (err instanceof FlickrError) {
			throw error(404, err.message);
		}
		throw err;
	}
};
