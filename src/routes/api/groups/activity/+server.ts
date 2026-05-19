import { error, json } from '@sveltejs/kit';
import { FlickrError } from '$lib/server/flickr/client';
import { getGroupInfo } from '$lib/server/flickr/groups';
import type { RequestHandler } from './$types';

const MAX_GROUPS = 250;

// Returns `dateactivity` (unix-seconds string) for each requested group NSID.
// Used by /user/[id]/groups to enable "sort by recent activity" without
// blocking the initial page render on N getInfo calls.
//
// Backed by the SQLite cache (24h TTL on getGroupInfo), so subsequent
// requests for the same set of groups serve almost entirely from cache.
// First-time crawls of a user with ~100 groups run ~1-3s as the cold misses
// fan out across Flickr in parallel.
export const GET: RequestHandler = async ({ url }) => {
	const idsParam = (url.searchParams.get('ids') ?? '').trim();
	if (!idsParam) return json({ activity: {} });

	const ids = idsParam
		.split(',')
		.map((s) => s.trim())
		.filter(Boolean);

	if (ids.length === 0) return json({ activity: {} });
	if (ids.length > MAX_GROUPS) {
		throw error(400, `Too many groups (max ${MAX_GROUPS})`);
	}

	const results = await Promise.all(
		ids.map(async (id) => {
			try {
				const info = await getGroupInfo(id);
				// `dateactivity` is unix-seconds, wrapped as a FlickrTextNode
				// in groups.getInfo responses (sometimes a bare string in
				// other endpoints). Some groups may not have it — return null
				// so the client renders them last in activity-sort.
				const raw = info.dateactivity;
				let ts: string | null = null;
				if (typeof raw === 'string') ts = raw;
				else if (typeof raw === 'number') ts = String(raw);
				else if (raw && typeof raw === 'object' && '_content' in raw && raw._content) {
					ts = String(raw._content);
				}
				return [id, ts] as const;
			} catch (err) {
				if (err instanceof FlickrError) return [id, null] as const;
				throw err;
			}
		})
	);

	const activity: Record<string, string | null> = {};
	for (const [id, ts] of results) activity[id] = ts;
	return json({ activity });
};
