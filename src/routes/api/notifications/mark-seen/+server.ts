import { json } from '@sveltejs/kit';
import { markAllNotificationsSeen, markNotificationSeen } from '$lib/server/cache';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
	const body = (await request.json().catch(() => ({}))) as { id?: number; all?: boolean };
	if (body.all) {
		markAllNotificationsSeen();
		return json({ ok: true, scope: 'all' });
	}
	if (typeof body.id === 'number') {
		markNotificationSeen(body.id);
		return json({ ok: true, scope: 'one', id: body.id });
	}
	return json({ ok: false, error: 'expected { all: true } or { id: number }' }, { status: 400 });
};
