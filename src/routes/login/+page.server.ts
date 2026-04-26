import { fail, redirect } from '@sveltejs/kit';
import { timingSafeEqual } from 'node:crypto';
import { requireEnv } from '$lib/server/env';
import { readAuth } from '$lib/server/auth/store';
import { mintSession, isSessionValid, SESSION_COOKIE, COOKIE_OPTIONS } from '$lib/server/session';
import { checkLoginRate, resetLoginRate, clientIp } from '$lib/server/rate-limit';
import type { Actions, PageServerLoad } from './$types';

const SAFE_NEXT_RE = /^\/[^/]/;

function safeNext(raw: string | null): string {
	if (!raw) return '';
	// Only allow same-origin paths starting with a single slash.
	if (!SAFE_NEXT_RE.test(raw) || raw.startsWith('//')) return '';
	return raw;
}

async function defaultLanding(): Promise<string> {
	const auth = await readAuth();
	if (auth?.username) {
		return `/user/${encodeURIComponent(auth.username)}/photostream`;
	}
	return '/';
}

export const load: PageServerLoad = async ({ cookies, url }) => {
	if (isSessionValid(cookies.get(SESSION_COOKIE))) {
		throw redirect(302, safeNext(url.searchParams.get('next')) || (await defaultLanding()));
	}
	return { next: safeNext(url.searchParams.get('next')) };
};

/** Constant-time password compare so a wrong-password attempt doesn't leak
 * length info via timing. Both inputs padded to the same length first. */
function passwordsMatch(provided: string, expected: string): boolean {
	const a = Buffer.from(provided);
	const b = Buffer.from(expected);
	if (a.length !== b.length) {
		// Still do a constant-time comparison against same-length bytes so the
		// length-mismatch case takes ~the same time as the same-length case.
		const dummy = Buffer.alloc(b.length);
		try {
			timingSafeEqual(dummy, b);
		} catch {
			/* ignore */
		}
		return false;
	}
	return timingSafeEqual(a, b);
}

export const actions: Actions = {
	default: async ({ request, cookies, getClientAddress }) => {
		const ip = clientIp(request.headers, getClientAddress());
		const rate = checkLoginRate(ip);
		if (!rate.allowed) {
			console.warn(`[login] rate-limited ${ip}, retry after ${rate.retryAfterSeconds}s`);
			return fail(429, {
				error: `Too many attempts. Try again in ${Math.ceil(rate.retryAfterSeconds / 60)} minute(s).`
			});
		}

		const data = await request.formData();
		const password = String(data.get('password') ?? '');
		const next = safeNext(String(data.get('next') ?? '') || null);

		const correct = requireEnv('APP_PASSWORD');
		if (!password || !passwordsMatch(password, correct)) {
			// 1s penalty in addition to the rate-limit window so even within the
			// 10-attempts budget brute force is painfully slow.
			await new Promise((r) => setTimeout(r, 1000));
			console.warn(
				`[login] failed attempt from ${ip} (${rate.attemptsRemaining} remaining in window)`
			);
			return fail(401, { error: 'Incorrect password' });
		}

		// Successful auth — wipe the failure counter so a flaky typist isn't
		// penalized after they finally get it right.
		resetLoginRate(ip);
		cookies.set(SESSION_COOKIE, mintSession(), COOKIE_OPTIONS);
		throw redirect(303, next || (await defaultLanding()));
	}
};
