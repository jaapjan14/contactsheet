import { redirect } from '@sveltejs/kit';
import { getRequestToken, getAuthorizeUrl } from '$lib/server/auth/flow';
import { setRequestTokenSecret } from '$lib/server/auth/store';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url }) => {
	const callbackUrl = `${url.origin}/auth/callback`;
	const { token, tokenSecret } = await getRequestToken(callbackUrl);
	setRequestTokenSecret(token, tokenSecret);
	throw redirect(302, getAuthorizeUrl(token, 'write'));
};
