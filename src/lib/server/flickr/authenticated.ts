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
