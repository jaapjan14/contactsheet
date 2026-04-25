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
