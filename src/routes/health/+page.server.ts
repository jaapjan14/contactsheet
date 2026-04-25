import { flickr, FlickrError } from '$lib/server/flickr/client';
import type { PageServerLoad } from './$types';

interface EchoResponse {
	stat: string;
	method: { _content: string };
	api_key: { _content: string };
	hello?: { _content: string };
}

export const load: PageServerLoad = async () => {
	try {
		const echo = await flickr<EchoResponse>({
			method: 'flickr.test.echo',
			params: { hello: 'contactsheet' }
		});
		return {
			ok: true as const,
			method: echo.method._content,
			apiKeyEcho: echo.api_key._content,
			helloEcho: echo.hello?._content ?? null
		};
	} catch (err) {
		const message = err instanceof FlickrError ? `Flickr ${err.code}: ${err.message}` : String(err);
		return { ok: false as const, error: message };
	}
};
