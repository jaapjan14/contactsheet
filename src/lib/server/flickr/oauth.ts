import { createHmac, randomBytes } from 'node:crypto';

export interface OAuthCredentials {
	consumerKey: string;
	consumerSecret: string;
	token?: string;
	tokenSecret?: string;
}

function percentEncode(value: string): string {
	return encodeURIComponent(value)
		.replace(/!/g, '%21')
		.replace(/\*/g, '%2A')
		.replace(/'/g, '%27')
		.replace(/\(/g, '%28')
		.replace(/\)/g, '%29');
}

export function signOAuth1(
	method: 'GET' | 'POST',
	url: string,
	requestParams: Record<string, string>,
	creds: OAuthCredentials
): Record<string, string> {
	const oauthParams: Record<string, string> = {
		oauth_consumer_key: creds.consumerKey,
		oauth_nonce: randomBytes(16).toString('hex'),
		oauth_signature_method: 'HMAC-SHA1',
		oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
		oauth_version: '1.0'
	};
	if (creds.token) oauthParams.oauth_token = creds.token;

	const allParams: Record<string, string> = { ...requestParams, ...oauthParams };
	const paramString = Object.keys(allParams)
		.sort()
		.map((k) => `${percentEncode(k)}=${percentEncode(allParams[k])}`)
		.join('&');

	const baseString = `${method}&${percentEncode(url)}&${percentEncode(paramString)}`;
	const signingKey = `${percentEncode(creds.consumerSecret)}&${percentEncode(creds.tokenSecret ?? '')}`;
	const signature = createHmac('sha1', signingKey).update(baseString).digest('base64');

	return { ...oauthParams, oauth_signature: signature };
}
