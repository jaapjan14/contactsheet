import { listNotifications } from '$lib/server/cache';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const items = listNotifications(200, 0);
	return { items };
};
