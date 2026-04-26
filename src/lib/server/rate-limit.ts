/**
 * In-memory IP rate limiter for the login endpoint. Same pattern as
 * Darkroom Log's app.js: a sliding window of attempt timestamps per IP,
 * with a periodic sweep of stale entries.
 *
 * Single-process, in-memory — survives no restarts and doesn't share
 * across instances. Fine for a single-container deployment.
 */

interface Bucket {
	timestamps: number[];
}

const buckets = new Map<string, Bucket>();
const WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const MAX_ATTEMPTS = 10;

let cleanupStarted = false;
function ensureCleanup(): void {
	if (cleanupStarted) return;
	cleanupStarted = true;
	setInterval(() => {
		const cutoff = Date.now() - WINDOW_MS;
		for (const [ip, b] of buckets) {
			const fresh = b.timestamps.filter((t) => t >= cutoff);
			if (fresh.length === 0) buckets.delete(ip);
			else b.timestamps = fresh;
		}
	}, 60 * 60 * 1000); // every hour
}

export interface RateCheck {
	allowed: boolean;
	retryAfterSeconds: number;
	attemptsRemaining: number;
}

/** Record an attempt and return whether the request should be allowed. */
export function checkLoginRate(ip: string): RateCheck {
	ensureCleanup();
	const now = Date.now();
	const cutoff = now - WINDOW_MS;
	const bucket = buckets.get(ip) ?? { timestamps: [] };
	bucket.timestamps = bucket.timestamps.filter((t) => t >= cutoff);

	if (bucket.timestamps.length >= MAX_ATTEMPTS) {
		const oldest = bucket.timestamps[0];
		const retryAfter = Math.max(1, Math.ceil((oldest + WINDOW_MS - now) / 1000));
		return { allowed: false, retryAfterSeconds: retryAfter, attemptsRemaining: 0 };
	}

	bucket.timestamps.push(now);
	buckets.set(ip, bucket);
	return {
		allowed: true,
		retryAfterSeconds: 0,
		attemptsRemaining: MAX_ATTEMPTS - bucket.timestamps.length
	};
}

/** Clear an IP's failure count after a successful login. */
export function resetLoginRate(ip: string): void {
	buckets.delete(ip);
}

/**
 * Pull the real client IP from common upstream-proxy headers. Behind
 * Cloudflare Tunnel, `cf-connecting-ip` is authoritative; fall back to
 * `x-forwarded-for` (first hop) and finally to whatever the framework
 * gives us.
 */
export function clientIp(headers: Headers, fallback: string): string {
	return (
		headers.get('cf-connecting-ip') ||
		headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
		fallback
	);
}
