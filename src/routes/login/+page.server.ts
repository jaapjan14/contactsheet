import { fail, redirect } from '@sveltejs/kit';
import { requireEnv } from '$lib/server/env';
import { mintSession, isSessionValid, SESSION_COOKIE, COOKIE_OPTIONS } from '$lib/server/session';
import type { Actions, PageServerLoad } from './$types';

const SAFE_NEXT_RE = /^\/[^/]/;

function safeNext(raw: string | null): string {
	if (!raw) return '/';
	// Only allow same-origin paths starting with a single slash.
	if (!SAFE_NEXT_RE.test(raw) || raw.startsWith('//')) return '/';
	return raw;
}

export const load: PageServerLoad = async ({ cookies, url }) => {
	if (isSessionValid(cookies.get(SESSION_COOKIE))) {
		throw redirect(302, safeNext(url.searchParams.get('next')));
	}
	return { next: safeNext(url.searchParams.get('next')) };
};

export const actions: Actions = {
	default: async ({ request, cookies, getClientAddress }) => {
		const data = await request.formData();
		const password = String(data.get('password') ?? '');
		const next = safeNext(String(data.get('next') ?? '') || null);

		const correct = requireEnv('APP_PASSWORD');
		if (!password || password !== correct) {
			// One-second penalty to mildly throttle naive brute force; the real
			// brake is Cloudflare Access / rate limiting at the edge.
			await new Promise((r) => setTimeout(r, 1000));
			console.warn(`[login] failed attempt from ${getClientAddress()}`);
			return fail(401, { error: 'Incorrect password' });
		}

		cookies.set(SESSION_COOKIE, mintSession(), COOKIE_OPTIONS);
		throw redirect(303, next);
	}
};
