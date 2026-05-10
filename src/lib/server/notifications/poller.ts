import { readAuth } from '$lib/server/auth/store';
import { getUserPhotosActivity, type ActivityEvent } from '$lib/server/flickr/activity';
import { getExplore } from '$lib/server/flickr/explore';
import { getUserPhotos } from '$lib/server/flickr/people';
import { getPhotoFavorites } from '$lib/server/flickr/photos';
import { insertNotification } from '$lib/server/cache';

// How often the background tick fires. Long enough to be polite to Flickr,
// short enough that "you got faved!" is reasonably timely.
const POLL_INTERVAL_MS = 15 * 60 * 1000;

// How many of the user's most-recent photos to check against the Explore
// set. Going beyond a few hundred is wasted: photos older than a few weeks
// don't usually land on Explore anymore.
const RECENT_PHOTOS_TO_CHECK = 200;

// Today's Explore is at most 500 photos; per_page=500 + page=1 gets all.
const EXPLORE_FETCH_PER_PAGE = 500;

// When a photo has recent fave activity, enumerate up to this many of its most
// recent favers. `flickr.activity.userPhotos` truncates the per-photo events
// array to only a handful, so a photo that gets 100 faves in a day shows up
// here as ~3. Pulling the full list backfills the missing ones; INSERT OR
// IGNORE on the sourceId means already-stored faves are no-ops.
const FAVES_BACKFILL_PER_PHOTO = 100;
// Only consider faves within this look-back when backfilling (matches the
// activity timeframe, prevents us from re-importing year-old faves on photos
// that just got new ones).
const FAVES_BACKFILL_WINDOW_S = 30 * 24 * 60 * 60;

// ---- Payload shapes (kept small so it's easy to render) ---------------

export interface FavoriteNotificationPayload {
	photoId: string;
	photoTitle: string;
	photoSecret: string;
	photoServer: string;
	user: string; // nsid of the user who faved
	username: string;
	dateadded: number; // unix seconds
}

export interface CommentNotificationPayload {
	photoId: string;
	photoTitle: string;
	photoSecret: string;
	photoServer: string;
	user: string;
	username: string;
	dateadded: number;
	commentId: string;
	commentBody: string;
}

export interface ExploreNotificationPayload {
	photoId: string;
	photoTitle: string;
	photoSecret: string;
	photoServer: string;
	exploreDate: string; // YYYY-MM-DD
	rank: number; // 1-based position in today's Explore set
}

// ---- Pollers ----------------------------------------------------------

function asArray<T>(maybe: T | T[] | undefined): T[] {
	if (!maybe) return [];
	return Array.isArray(maybe) ? maybe : [maybe];
}

async function pollActivity(): Promise<{ inserted: number }> {
	const items = await getUserPhotosActivity('30d', 50);
	let inserted = 0;

	// Track photos with any fave activity so we can enumerate their full faver
	// list afterwards. The activity API truncates per-photo events.
	const photosWithFaves = new Map<
		string,
		{ id: string; secret: string; server: string; title: string }
	>();

	for (const item of items) {
		const events = asArray<ActivityEvent>(item.activity?.event as ActivityEvent | ActivityEvent[]);
		for (const ev of events) {
			if (ev.type === 'fave') {
				photosWithFaves.set(item.id, {
					id: item.id,
					secret: item.secret,
					server: item.server,
					title: item.title?._content ?? ''
				});
				const sourceId = `fave:${item.id}:${ev.user}:${ev.dateadded}`;
				const payload: FavoriteNotificationPayload = {
					photoId: item.id,
					photoTitle: item.title?._content ?? '',
					photoSecret: item.secret,
					photoServer: item.server,
					user: ev.user,
					username: ev.username,
					dateadded: Number(ev.dateadded)
				};
				if (insertNotification('favorite', sourceId, payload)) inserted++;
			} else if (ev.type === 'comment') {
				const commentId = ev.commentid ?? `${item.id}-${ev.dateadded}-${ev.user}`;
				const sourceId = `comment:${commentId}`;
				const payload: CommentNotificationPayload = {
					photoId: item.id,
					photoTitle: item.title?._content ?? '',
					photoSecret: item.secret,
					photoServer: item.server,
					user: ev.user,
					username: ev.username,
					dateadded: Number(ev.dateadded),
					commentId,
					commentBody: ev._content ?? ''
				};
				if (insertNotification('comment', sourceId, payload)) inserted++;
			}
		}
	}

	// Backfill: for each photo with recent fave activity, fetch the full faver
	// list and insert any we don't already have. Recovers what activity.userPhotos
	// dropped — a photo with 98 faves in a day shows ~3 events from that endpoint
	// but all 98 from photos.getFavorites.
	const cutoff = Math.floor(Date.now() / 1000) - FAVES_BACKFILL_WINDOW_S;
	for (const photo of photosWithFaves.values()) {
		try {
			const favers = await getPhotoFavorites(photo.id, FAVES_BACKFILL_PER_PHOTO);
			for (const f of favers) {
				if (!Number.isFinite(f.favedate) || f.favedate < cutoff) continue;
				const sourceId = `fave:${photo.id}:${f.nsid}:${f.favedate}`;
				const payload: FavoriteNotificationPayload = {
					photoId: photo.id,
					photoTitle: photo.title,
					photoSecret: photo.secret,
					photoServer: photo.server,
					user: f.nsid,
					username: f.username,
					dateadded: f.favedate
				};
				if (insertNotification('favorite', sourceId, payload)) inserted++;
			}
		} catch (err) {
			console.error(`[notifications] backfill faves failed for ${photo.id}:`, err);
		}
	}

	return { inserted };
}

async function pollExplore(nsid: string): Promise<{ inserted: number }> {
	const today = new Date().toISOString().slice(0, 10);

	// Get today's full Explore set (up to 500 photos).
	const explorePage = await getExplore(undefined, 1, EXPLORE_FETCH_PER_PAGE);
	const exploreById = new Map<string, { rank: number; photo: (typeof explorePage.photo)[number] }>();
	explorePage.photo.forEach((p, idx) => {
		exploreById.set(p.id, { rank: idx + 1, photo: p });
	});
	if (exploreById.size === 0) return { inserted: 0 };

	// Pull the user's most-recent uploads and intersect.
	const myPhotos = await getUserPhotos(nsid, 1, RECENT_PHOTOS_TO_CHECK);
	let inserted = 0;
	for (const mine of myPhotos.photo) {
		const hit = exploreById.get(mine.id);
		if (!hit) continue;
		const sourceId = `explore:${mine.id}:${today}`;
		const payload: ExploreNotificationPayload = {
			photoId: mine.id,
			photoTitle: hit.photo.title ?? mine.title ?? '',
			photoSecret: hit.photo.secret,
			photoServer: hit.photo.server,
			exploreDate: today,
			rank: hit.rank
		};
		if (insertNotification('explore', sourceId, payload)) inserted++;
	}
	return { inserted };
}

// ---- Tick + wiring ----------------------------------------------------

async function tick(): Promise<void> {
	const auth = await readAuth();
	if (!auth) return; // no signed-in Flickr user yet — skip silently

	try {
		const a = await pollActivity();
		if (a.inserted > 0) console.log(`[notifications] +${a.inserted} activity events`);
	} catch (err) {
		console.error('[notifications] activity poll failed:', err);
	}

	try {
		const e = await pollExplore(auth.nsid);
		if (e.inserted > 0) console.log(`[notifications] +${e.inserted} explore hits`);
	} catch (err) {
		console.error('[notifications] explore poll failed:', err);
	}
}

const globalForPoller = globalThis as unknown as {
	__contactsheet_notifications_poller?: NodeJS.Timeout;
};

export function startNotificationsPoller(): void {
	if (globalForPoller.__contactsheet_notifications_poller) return;
	// Initial tick: delay a few seconds so the server has settled (avoids
	// blocking startup on a slow Flickr round-trip).
	setTimeout(() => {
		tick();
	}, 5_000);
	globalForPoller.__contactsheet_notifications_poller = setInterval(tick, POLL_INTERVAL_MS);
}

/** Run a tick on demand — used by the manual /api/notifications/poll endpoint. */
export async function runPollerNow(): Promise<void> {
	await tick();
}
