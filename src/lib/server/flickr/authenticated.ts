import { redirect } from '@sveltejs/kit';
import { readAuth } from '$lib/server/auth/store';
import { flickr, type FlickrCallOptions } from './client';

/**
 * Wrapper around flickr() that auto-attaches the stored access token.
 * Throws a redirect to /auth/start if no token is stored.
 */
export async function flickrAuth<T = unknown>(
	opts: Omit<FlickrCallOptions, 'signed' | 'token'>
): Promise<T> {
	const auth = await readAuth();
	if (!auth) throw redirect(302, '/auth/start');
	return flickr<T>({
		...opts,
		signed: true,
		token: { token: auth.access_token, secret: auth.access_token_secret }
	});
}

/**
 * Like flickr() but signs the call when auth is available, falls back to
 * unsigned otherwise. Useful for endpoints that work unsigned for public
 * resources but need authentication for private/members-only ones — Flickr
 * groups, especially.
 */
export async function flickrMaybeSigned<T = unknown>(
	opts: Omit<FlickrCallOptions, 'signed' | 'token'>
): Promise<T> {
	const auth = await readAuth();
	if (auth) {
		return flickr<T>({
			...opts,
			signed: true,
			token: { token: auth.access_token, secret: auth.access_token_secret }
		});
	}
	return flickr<T>(opts);
}

/**
 * Cache key suffix that distinguishes signed-vs-anonymous responses for
 * helpers that wrap `flickrMaybeSigned` with the SQLite cache. Flickr
 * sometimes returns different field values for signed vs unsigned calls
 * (e.g., a private group's `topic_count` is `0` unsigned but `1` for the
 * admin), so a single shared cache slot can poison the other auth context
 * with the wrong value. Threading this into the cache `key()` params keeps
 * the two responses in separate slots.
 *
 * Single-user app today — `'1'` (auth present) or `'0'` (no auth) is
 * sufficient. If multi-user lands someday, swap this for a per-user
 * identifier so each user has their own cache namespace.
 */
export async function authSig(): Promise<string> {
	return (await readAuth()) ? '1' : '0';
}
