import { redirect, type Handle } from '@sveltejs/kit';
import { isSessionValid, SESSION_COOKIE } from '$lib/server/session';

// Routes reachable WITHOUT a valid session cookie.
// /login (GET form + POST action) and the SvelteKit static assets are the
// only public surfaces. Everything else (including /auth/* OAuth endpoints
// and /api/*) requires the app password — this is the only thing standing
// between an open URL and a stranger using Jacob's Flickr account.
const PUBLIC_PATHS = new Set(['/login', '/favicon.svg', '/favicon.ico', '/robots.txt']);
const PUBLIC_PREFIXES = ['/_app/', '/@vite/', '/@fs/', '/node_modules/'];

function isPublicPath(pathname: string): boolean {
	if (PUBLIC_PATHS.has(pathname)) return true;
	for (const prefix of PUBLIC_PREFIXES) {
		if (pathname.startsWith(prefix)) return true;
	}
	return false;
}

export const handle: Handle = async ({ event, resolve }) => {
	const path = event.url.pathname;

	// App-password gate
	if (!isPublicPath(path)) {
		const cookie = event.cookies.get(SESSION_COOKIE);
		if (!isSessionValid(cookie)) {
			const next = path + event.url.search;
			throw redirect(302, `/login?next=${encodeURIComponent(next)}`);
		}
	}

	const response = await resolve(event);

	// Security headers
	response.headers.set('X-Content-Type-Options', 'nosniff');
	response.headers.set('X-Frame-Options', 'DENY');
	response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
	response.headers.set(
		'Permissions-Policy',
		'camera=(), microphone=(), geolocation=(), payment=(), usb=(), magnetometer=(), gyroscope=(), accelerometer=()'
	);
	response.headers.set('Cross-Origin-Opener-Policy', 'same-origin');

	const forwardedProto = event.request.headers.get('x-forwarded-proto');
	const isHttps = forwardedProto === 'https' || event.url.protocol === 'https:';
	if (isHttps) {
		response.headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains');
	}

	return response;
};
