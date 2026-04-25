import type { Handle } from '@sveltejs/kit';

/**
 * Security headers applied to every response.
 *
 * CSP is configured separately in svelte.config.js so that SvelteKit can
 * generate per-request nonces / per-page hashes for its inline hydration
 * scripts — that's where the heavy lifting lives. Everything below is the
 * complementary set of headers that don't have a SvelteKit equivalent.
 */
export const handle: Handle = async ({ event, resolve }) => {
	const response = await resolve(event);

	response.headers.set('X-Content-Type-Options', 'nosniff');
	response.headers.set('X-Frame-Options', 'DENY');
	response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
	response.headers.set(
		'Permissions-Policy',
		'camera=(), microphone=(), geolocation=(), payment=(), usb=(), magnetometer=(), gyroscope=(), accelerometer=()'
	);
	// Cross-Origin-Opener-Policy keeps top-level browsing contexts isolated from
	// any window.opener handles, which closes a class of cross-origin attacks.
	response.headers.set('Cross-Origin-Opener-Policy', 'same-origin');

	// HSTS only makes sense on HTTPS responses. When ContactSheet runs behind
	// the Cloudflare tunnel, cloudflared talks to the container over plain HTTP
	// inside the NAS, so we have to consult `x-forwarded-proto` rather than
	// `event.url.protocol`.
	const forwardedProto = event.request.headers.get('x-forwarded-proto');
	const isHttps = forwardedProto === 'https' || event.url.protocol === 'https:';
	if (isHttps) {
		response.headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains');
	}

	return response;
};
