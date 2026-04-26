import { json } from '@sveltejs/kit';
import { listNotifications } from '$lib/server/cache';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url }) => {
	const limit = Math.min(200, Math.max(1, Number(url.searchParams.get('limit') ?? '50')));
	const offset = Math.max(0, Number(url.searchParams.get('offset') ?? '0'));
	const items = listNotifications(limit, offset);
	return json({ items });
};
