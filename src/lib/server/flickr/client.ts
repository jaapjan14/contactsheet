import { requireEnv } from '$lib/server/env';
import { signOAuth1 } from './oauth';

const REST_ENDPOINT = 'https://api.flickr.com/services/rest';

export interface FlickrCallOptions {
	method: string;
	params?: Record<string, string>;
	signed?: boolean;
	token?: { token: string; secret: string };
}

export class FlickrError extends Error {
	constructor(
		public code: number,
		message: string,
		/**
		 * Set when the failure was an HTTP transport error (a Flickr outage /
		 * "panda" 5xx page, or a 429 rate-limit) rather than an API-level
		 * `stat:fail`. Lets routes map transient upstream failures to a
		 * retryable state instead of a misleading "not found".
		 */
		public httpStatus?: number
	) {
		super(message);
		this.name = 'FlickrError';
	}
}

export async function flickr<T = unknown>(opts: FlickrCallOptions): Promise<T> {
	const apiKey = requireEnv('FLICKR_API_KEY');
	const baseParams: Record<string, string> = {
		method: opts.method,
		api_key: apiKey,
		format: 'json',
		nojsoncallback: '1',
		...(opts.params ?? {})
	};

	let finalParams: Record<string, string> = baseParams;
	if (opts.signed) {
		const oauthParams = signOAuth1('GET', REST_ENDPOINT, baseParams, {
			consumerKey: apiKey,
			consumerSecret: requireEnv('FLICKR_API_SECRET'),
			token: opts.token?.token,
			tokenSecret: opts.token?.secret
		});
		finalParams = { ...baseParams, ...oauthParams };
	}

	const qs = new URLSearchParams(finalParams).toString();
	const res = await fetch(`${REST_ENDPOINT}?${qs}`);
	if (!res.ok) {
		// Truncate the body: Flickr's 5xx "panda" responses are full HTML error
		// pages that otherwise flood the logs. 200 chars is enough to identify
		// the cause. Throw a FlickrError (not a plain Error) carrying the HTTP
		// status so callers can catch it like any other Flickr failure and
		// distinguish a transient outage/rate-limit from an API-level error.
		const body = (await res.text()).replace(/\s+/g, ' ').trim().slice(0, 200);
		throw new FlickrError(res.status, `Flickr HTTP ${res.status}: ${body}`, res.status);
	}
	const json = (await res.json()) as { stat: string; code?: number; message?: string };
	if (json.stat !== 'ok') {
		throw new FlickrError(json.code ?? -1, json.message ?? 'Unknown Flickr error');
	}
	return json as T;
}
