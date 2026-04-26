import Database, { type Database as DBType } from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const DB_PATH = 'data/cache.db';
mkdirSync(dirname(DB_PATH), { recursive: true });

// Survive HMR in dev — without this, every reload opens a fresh connection
// and starts a fresh purge interval.
const globalForDb = globalThis as unknown as {
	__contactsheet_cache_db?: DBType;
	__contactsheet_cache_purge?: NodeJS.Timeout;
};

const db: DBType = globalForDb.__contactsheet_cache_db ?? new Database(DB_PATH);
if (!globalForDb.__contactsheet_cache_db) {
	db.pragma('journal_mode = WAL');
	db.pragma('synchronous = NORMAL');
	db.exec(`
		CREATE TABLE IF NOT EXISTS kv (
			key TEXT PRIMARY KEY,
			value TEXT NOT NULL,
			expires_at INTEGER NOT NULL
		);
		CREATE INDEX IF NOT EXISTS idx_expires ON kv(expires_at);

		CREATE TABLE IF NOT EXISTS notifications (
			id INTEGER PRIMARY KEY,
			type TEXT NOT NULL,
			source_id TEXT NOT NULL UNIQUE,
			payload TEXT NOT NULL,
			seen_at INTEGER,
			created_at INTEGER NOT NULL
		);
		CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(created_at DESC);
		CREATE INDEX IF NOT EXISTS idx_notifications_seen ON notifications(seen_at);
	`);
	globalForDb.__contactsheet_cache_db = db;
}

const getStmt = db.prepare<[string], { value: string; expires_at: number }>(
	'SELECT value, expires_at FROM kv WHERE key = ?'
);
const setStmt = db.prepare<[string, string, number]>(
	`INSERT INTO kv (key, value, expires_at) VALUES (?, ?, ?)
	 ON CONFLICT(key) DO UPDATE SET value = excluded.value, expires_at = excluded.expires_at`
);
const purgeStmt = db.prepare<[number]>('DELETE FROM kv WHERE expires_at < ?');
const deleteStmt = db.prepare<[string]>('DELETE FROM kv WHERE key = ?');
const deletePrefixStmt = db.prepare<[string]>('DELETE FROM kv WHERE key LIKE ?');

export function get<T>(key: string): T | null {
	const row = getStmt.get(key);
	if (!row) return null;
	if (row.expires_at < Date.now()) return null;
	try {
		return JSON.parse(row.value) as T;
	} catch {
		return null;
	}
}

export function set<T>(key: string, value: T, ttlSeconds: number): void {
	const expiresAt = Date.now() + ttlSeconds * 1000;
	setStmt.run(key, JSON.stringify(value), expiresAt);
}

export function del(key: string): void {
	deleteStmt.run(key);
}

/** Invalidate every key matching `prefix*` — useful for "this user posted a comment, drop their photo's comment cache". */
export function delPrefix(prefix: string): void {
	deletePrefixStmt.run(`${prefix}%`);
}

/** Lookup-or-fetch. Returns the cached value if fresh; otherwise calls `fetcher`, caches its result, and returns it. */
export async function wrap<T>(
	key: string,
	ttlSeconds: number,
	fetcher: () => Promise<T>
): Promise<T> {
	const cached = get<T>(key);
	if (cached !== null) return cached;
	const value = await fetcher();
	set(key, value, ttlSeconds);
	return value;
}

if (!globalForDb.__contactsheet_cache_purge) {
	globalForDb.__contactsheet_cache_purge = setInterval(
		() => {
			try {
				purgeStmt.run(Date.now());
			} catch {
				/* ignore */
			}
		},
		60 * 1000
	);
}

// ---- Notifications -----------------------------------------------------

export type NotificationType = 'explore' | 'favorite' | 'comment';

export interface NotificationRow {
	id: number;
	type: NotificationType;
	source_id: string;
	payload: string;
	seen_at: number | null;
	created_at: number;
}

export interface Notification<P = unknown> {
	id: number;
	type: NotificationType;
	source_id: string;
	payload: P;
	seen_at: number | null;
	created_at: number;
}

const insertNotificationStmt = db.prepare<[string, string, string, number]>(
	`INSERT OR IGNORE INTO notifications (type, source_id, payload, created_at)
	 VALUES (?, ?, ?, ?)`
);

const listNotificationsStmt = db.prepare<[number, number], NotificationRow>(
	`SELECT * FROM notifications
	 ORDER BY created_at DESC
	 LIMIT ? OFFSET ?`
);

const unreadCountStmt = db.prepare<[], { c: number }>(
	`SELECT COUNT(*) AS c FROM notifications WHERE seen_at IS NULL`
);

const markAllSeenStmt = db.prepare<[number]>(
	`UPDATE notifications SET seen_at = ? WHERE seen_at IS NULL`
);

const markOneSeenStmt = db.prepare<[number, number]>(
	`UPDATE notifications SET seen_at = ? WHERE id = ?`
);

/** Insert a notification. Idempotent on (source_id) — duplicate inserts are dropped. Returns true if a row was actually inserted. */
export function insertNotification(
	type: NotificationType,
	sourceId: string,
	payload: unknown
): boolean {
	const result = insertNotificationStmt.run(
		type,
		sourceId,
		JSON.stringify(payload),
		Date.now()
	);
	return result.changes > 0;
}

export function listNotifications<P = unknown>(
	limit = 50,
	offset = 0
): Notification<P>[] {
	const rows = listNotificationsStmt.all(limit, offset);
	return rows.map((r) => ({
		id: r.id,
		type: r.type,
		source_id: r.source_id,
		payload: JSON.parse(r.payload) as P,
		seen_at: r.seen_at,
		created_at: r.created_at
	}));
}

export function unreadNotificationCount(): number {
	const row = unreadCountStmt.get();
	return row?.c ?? 0;
}

export function markAllNotificationsSeen(): void {
	markAllSeenStmt.run(Date.now());
}

export function markNotificationSeen(id: number): void {
	markOneSeenStmt.run(Date.now(), id);
}

// ---- key builder -------------------------------------------------------

/** Build a stable cache key from a method name and a params object. */
export function key(
	method: string,
	params: Record<string, string | number | undefined | null> = {}
): string {
	const parts = Object.entries(params)
		.filter(([, v]) => v !== undefined && v !== null && v !== '')
		.sort(([a], [b]) => a.localeCompare(b))
		.map(([k, v]) => `${k}=${v}`)
		.join('&');
	return parts ? `${method}|${parts}` : method;
}
