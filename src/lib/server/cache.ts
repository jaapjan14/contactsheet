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
