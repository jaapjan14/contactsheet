import { error, redirect } from '@sveltejs/kit';
import { exchangeForAccessToken } from '$lib/server/auth/flow';
import { takeRequestTokenSecret, writeAuth } from '$lib/server/auth/store';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url }) => {
	const oauthToken = url.searchParams.get('oauth_token');
	const oauthVerifier = url.searchParams.get('oauth_verifier');
	if (!oauthToken || !oauthVerifier) {
		throw error(400, 'Missing oauth_token or oauth_verifier');
	}

	const requestTokenSecret = takeRequestTokenSecret(oauthToken);
	if (!requestTokenSecret) {
		throw error(
			400,
			'Unknown or expired request token. Restart the sign-in flow at /auth/start.'
		);
	}

	const access = await exchangeForAccessToken(
		oauthToken,
		oauthVerifier,
		requestTokenSecret
	);

	await writeAuth({
		nsid: access.nsid,
		username: access.username,
		fullname: access.fullname,
		access_token: access.token,
		access_token_secret: access.tokenSecret,
		obtained_at: new Date().toISOString()
	});

	throw redirect(302, `/user/${encodeURIComponent(access.username)}/photostream`);
};
