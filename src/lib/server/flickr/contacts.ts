import { flickrAuth } from './authenticated';
import { wrap, key, del } from '$lib/server/cache';

const TTL_CONTACTS = 5 * 60; // 5 min — contact list moves slowly

export interface FlickrContact {
	nsid: string;
	username: string;
	iconserver?: string;
	iconfarm?: number;
	ignored?: number;
	rev_ignored?: number;
	realname?: string;
	friend?: number;
	family?: number;
	path_alias?: string | null;
}

interface ContactsListResponse {
	stat: string;
	contacts: {
		page: number;
		pages: number;
		per_page: number;
		total: number;
		contact: FlickrContact[];
	};
}

/**
 * Authenticated user's contact list (Flickr's term for "people you follow").
 * Cached 5 min keyed on the *authed* user's nsid so a future multi-user
 * deployment doesn't cross-contaminate.
 *
 * Returned shape is the contact rows in display order — callers wrap into
 * a Set when they only need membership lookup.
 */
export async function getMyContacts(meNsid: string): Promise<FlickrContact[]> {
	return wrap(key('contacts.getList', { me: meNsid }), TTL_CONTACTS, async () => {
		// per_page=1000 — Flickr's hard cap. Realistic personal account
		// follow lists are well under this; if we ever cross it the right
		// fix is paginating here, not bumping per_page further.
		const res = await flickrAuth<ContactsListResponse>({
			method: 'flickr.contacts.getList',
			params: { per_page: '1000' }
		});
		return res.contacts.contact ?? [];
	});
}

/**
 * Set of contact NSIDs for fast `isContact()` checks. Same cache as
 * getMyContacts so list+set views stay in sync.
 */
export async function getMyContactNsidSet(meNsid: string): Promise<Set<string>> {
	const list = await getMyContacts(meNsid);
	return new Set(list.map((c) => c.nsid));
}

/**
 * Drop the contact list cache — call after a follow/unfollow action elsewhere
 * (currently only happens on flickr.com itself, so this is best-effort).
 */
export function invalidateMyContacts(meNsid: string): void {
	del(key('contacts.getList', { me: meNsid }));
}
