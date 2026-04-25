import { requireEnv } from '$lib/server/env';
import { signOAuth1 } from '$lib/server/flickr/oauth';

const REQUEST_TOKEN_URL = 'https://www.flickr.com/services/oauth/request_token';
const AUTHORIZE_URL = 'https://www.flickr.com/services/oauth/authorize';
const ACCESS_TOKEN_URL = 'https://www.flickr.com/services/oauth/access_token';

export interface RequestTokenResult {
	token: string;
	tokenSecret: string;
}

export interface AccessTokenResult {
	token: string;
	tokenSecret: string;
	nsid: string;
	username: string;
	fullname?: string;
}

async function postOAuth(url: string, params: Record<string, string>): Promise<URLSearchParams> {
	const res = await fetch(`${url}?${new URLSearchParams(params).toString()}`);
	if (!res.ok) {
		const body = await res.text();
		throw new Error(`Flickr OAuth ${res.status} at ${url}: ${body.slice(0, 200)}`);
	}
	return new URLSearchParams(await res.text());
}

export async function getRequestToken(callbackUrl: string): Promise<RequestTokenResult> {
	const params: Record<string, string> = { oauth_callback: callbackUrl };
	const oauth = signOAuth1('GET', REQUEST_TOKEN_URL, params, {
		consumerKey: requireEnv('FLICKR_API_KEY'),
		consumerSecret: requireEnv('FLICKR_API_SECRET')
	});
	const merged = { ...params, ...oauth };
	const parsed = await postOAuth(REQUEST_TOKEN_URL, merged);
	if (parsed.get('oauth_callback_confirmed') !== 'true') {
		throw new Error('Flickr did not confirm the OAuth callback');
	}
	const token = parsed.get('oauth_token');
	const tokenSecret = parsed.get('oauth_token_secret');
	if (!token || !tokenSecret) throw new Error('Missing oauth_token in response');
	return { token, tokenSecret };
}

export function getAuthorizeUrl(
	requestToken: string,
	perms: 'read' | 'write' | 'delete' = 'write'
): string {
	const qs = new URLSearchParams({ oauth_token: requestToken, perms }).toString();
	return `${AUTHORIZE_URL}?${qs}`;
}

export async function exchangeForAccessToken(
	oauthToken: string,
	oauthVerifier: string,
	requestTokenSecret: string
): Promise<AccessTokenResult> {
	const params: Record<string, string> = { oauth_verifier: oauthVerifier };
	const oauth = signOAuth1('GET', ACCESS_TOKEN_URL, params, {
		consumerKey: requireEnv('FLICKR_API_KEY'),
		consumerSecret: requireEnv('FLICKR_API_SECRET'),
		token: oauthToken,
		tokenSecret: requestTokenSecret
	});
	const merged = { ...params, ...oauth };
	const parsed = await postOAuth(ACCESS_TOKEN_URL, merged);
	const token = parsed.get('oauth_token');
	const tokenSecret = parsed.get('oauth_token_secret');
	const nsid = parsed.get('user_nsid');
	const username = parsed.get('username');
	if (!token || !tokenSecret || !nsid || !username) {
		throw new Error('Incomplete access_token response from Flickr');
	}
	return {
		token,
		tokenSecret,
		nsid,
		username,
		fullname: parsed.get('fullname') ?? undefined
	};
}
