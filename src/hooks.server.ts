import { redirect, type Handle } from '@sveltejs/kit';
import { isSessionValid, SESSION_COOKIE } from '$lib/server/session';
import { startNotificationsPoller } from '$lib/server/notifications/poller';

// Start the background notifications poller on server boot. Idempotent —
// the function itself guards against double-start across HMR.
startNotificationsPoller();

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

	// Force-fresh HTML on every navigation. Cloudflare otherwise caches HTML
	// at the edge for ~2 hours by default, which means a freshly deployed
	// container can still serve users an old hashed JS bundle reference and
	// the new code is never loaded. Hashed `/_app/immutable/**` assets are
	// content-addressable so they're safe to cache aggressively (and they
	// already advertise that themselves).
	const isImmutable = path.startsWith('/_app/immutable/');
	if (!isImmutable) {
		response.headers.set('Cache-Control', 'no-store, must-revalidate');
	}

	// Security headers
	response.headers.set('X-Content-Type-Options', 'nosniff');
	response.headers.set('X-Frame-Options', 'DENY');
	response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
	response.headers.set(
		'Permissions-Policy',
		'camera=(), microphone=(), geolocation=(), payment=(), usb=(), magnetometer=(), gyroscope=(), accelerometer=()'
	);
	response.headers.set('Cross-Origin-Opener-Policy', 'same-origin');

	// NOTE: the actual Content-Security-Policy is set by SvelteKit from
	// `kit.csp.directives` in svelte.config.js — it injects a per-request
	// nonce into script-src so the inline hydration script can run. DO NOT
	// override `Content-Security-Policy` here; doing so strips the nonce
	// and the page fails to hydrate (manifesting as "infinite scroll
	// stopped working" / "all client-side interactivity is dead").
	//
	// We do still clobber `Content-Security-Policy-Report-Only`: Cloudflare
	// can inject a strict report-only at the edge that floods the console
	// with "[Report Only] Refused to connect" for our own /api/* calls.
	response.headers.set('Content-Security-Policy-Report-Only', "default-src 'self' *");

	const forwardedProto = event.request.headers.get('x-forwarded-proto');
	const isHttps = forwardedProto === 'https' || event.url.protocol === 'https:';
	if (isHttps) {
		response.headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains');
	}

	return response;
};
