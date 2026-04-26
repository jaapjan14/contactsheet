import { json } from '@sveltejs/kit';
import { runPollerNow } from '$lib/server/notifications/poller';
import type { RequestHandler } from './$types';

// Manual trigger for the poller — handy for testing without waiting 15
// minutes. The poller is also called automatically on a background interval.
export const POST: RequestHandler = async () => {
	await runPollerNow();
	return json({ ok: true });
};
