export type FlickrSize = 's' | 'q' | 't' | 'm' | 'n' | 'w' | 'z' | 'c' | 'b' | 'h' | 'k' | 'o';

export interface PhotoIdent {
	id: string;
	server: string;
	secret: string;
}

export function photoUrl(p: PhotoIdent, size: FlickrSize = 'z'): string {
	return `https://live.staticflickr.com/${p.server}/${p.id}_${p.secret}_${size}.jpg`;
}

export interface AvatarIdent {
	nsid: string;
	iconfarm: number;
	iconserver: string;
}

export function avatarUrl(u: AvatarIdent): string {
	if (!u.iconserver || u.iconserver === '0') {
		return 'https://www.flickr.com/images/buddyicon.gif';
	}
	return `https://farm${u.iconfarm}.staticflickr.com/${u.iconserver}/buddyicons/${u.nsid}.jpg`;
}

export function photoPageHref(photoId: string): string {
	return `/photo/${photoId}`;
}

export function userPageHref(userId: string, tab = 'photostream'): string {
	return `/user/${encodeURIComponent(userId)}/${tab}`;
}

// Flickr's short URL — base58 of the photo id, prefixed with `flic.kr/p/`.
// The alphabet skips visually ambiguous characters (0/O, l/I).
const FLICKR_BASE58 =
	'123456789abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ';

export function flickrShortUrl(photoId: string): string {
	let n = BigInt(photoId);
	if (n <= 0n) return `https://flic.kr/p/${photoId}`;
	const base = BigInt(FLICKR_BASE58.length);
	let out = '';
	while (n > 0n) {
		out = FLICKR_BASE58[Number(n % base)] + out;
		n /= base;
	}
	return `https://flic.kr/p/${out}`;
}
