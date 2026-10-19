// Sort choices for the photo grids that support them (photostream, faves,
// group pool). The value travels in `?sort=` and is remembered per tab in a
// cookie, so the server load can apply it without a client round-trip.

export interface SortOption {
	value: string;
	label: string;
}

export type SortTab = 'photostream' | 'faves' | 'group';

// flickr.people.getPhotos has no sort param (always newest-posted first), so
// every order except date-posted-desc goes through photos.search&user_id=.
export const PHOTOSTREAM_SORTS: SortOption[] = [
	{ value: 'date-taken-desc', label: 'Date taken · newest' },
	{ value: 'date-taken-asc', label: 'Date taken · oldest' },
	{ value: 'date-posted-desc', label: 'Date posted · newest' },
	{ value: 'date-posted-asc', label: 'Date posted · oldest' },
	{ value: 'interestingness-desc', label: 'Interesting' }
];

// The faves APIs have no sort param either; date-taken orders are built by
// fetching the list and sorting server-side (see getUserFavesByDateTaken).
export const FAVES_SORTS: SortOption[] = [
	{ value: 'faved-desc', label: 'Date faved · newest' },
	{ value: 'date-taken-desc', label: 'Date taken · newest' },
	{ value: 'date-taken-asc', label: 'Date taken · oldest' }
];

// added-desc is the native pool order (groups.pools.getPhotos); the rest go
// through photos.search&group_id=.
export const GROUP_SORTS: SortOption[] = [
	{ value: 'added-desc', label: 'Date added · newest' },
	{ value: 'date-taken-desc', label: 'Date taken · newest' },
	{ value: 'date-taken-asc', label: 'Date taken · oldest' },
	{ value: 'interestingness-desc', label: 'Interesting' }
];

export const SORTS: Record<SortTab, { options: SortOption[]; fallback: string }> = {
	photostream: { options: PHOTOSTREAM_SORTS, fallback: 'date-taken-desc' },
	faves: { options: FAVES_SORTS, fallback: 'faved-desc' },
	group: { options: GROUP_SORTS, fallback: 'added-desc' }
};

export const sortCookieName = (tab: SortTab) => `cs_sort_${tab}`;

/** First valid value of: explicit `?sort=`, remembered cookie, tab default. */
export function pickSort(
	tab: SortTab,
	fromUrl: string | null | undefined,
	fromCookie: string | null | undefined
): string {
	const { options, fallback } = SORTS[tab];
	const valid = (v: string | null | undefined) => !!v && options.some((o) => o.value === v);
	if (valid(fromUrl)) return fromUrl!;
	if (valid(fromCookie)) return fromCookie!;
	return fallback;
}
