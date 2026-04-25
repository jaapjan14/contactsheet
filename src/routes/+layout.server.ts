import { readAuth } from '$lib/server/auth/store';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async () => {
	const auth = await readAuth();
	return {
		me: auth
			? {
					nsid: auth.nsid,
					username: auth.username,
					fullname: auth.fullname ?? null
				}
			: null
	};
};
