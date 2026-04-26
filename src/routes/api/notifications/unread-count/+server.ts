import { json } from '@sveltejs/kit';
import { unreadNotificationCount } from '$lib/server/cache';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
	return json({ count: unreadNotificationCount() });
};
