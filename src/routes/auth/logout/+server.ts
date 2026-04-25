import { redirect } from '@sveltejs/kit';
import { clearAuth } from '$lib/server/auth/store';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async () => {
	await clearAuth();
	throw redirect(303, '/');
};
