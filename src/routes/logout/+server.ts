import { redirect } from '@sveltejs/kit';
import { SESSION_COOKIE } from '$lib/server/session';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ cookies }) => {
	cookies.delete(SESSION_COOKIE, { path: '/' });
	throw redirect(303, '/login');
};
