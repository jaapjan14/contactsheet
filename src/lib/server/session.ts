import { createHmac, timingSafeEqual } from 'node:crypto';
import { requireEnv } from './env';

const COOKIE_NAME = 'cs_session';
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export const SESSION_COOKIE = COOKIE_NAME;

function sign(payload: string): string {
	return createHmac('sha256', requireEnv('SESSION_SECRET'))
		.update(payload)
		.digest('base64url');
}

/** Build a fresh cookie value: `<expiresAtMs>.<hmac>`. */
export function mintSession(): string {
	const exp = Date.now() + SESSION_TTL_MS;
	const payload = String(exp);
	return `${payload}.${sign(payload)}`;
}

/** Constant-time validation of a cookie value. */
export function isSessionValid(value: string | undefined): boolean {
	if (!value) return false;
	const idx = value.indexOf('.');
	if (idx <= 0) return false;
	const payload = value.slice(0, idx);
	const sig = value.slice(idx + 1);
	const expected = sign(payload);
	if (sig.length !== expected.length) return false;
	const a = Buffer.from(sig);
	const b = Buffer.from(expected);
	if (a.length !== b.length || !timingSafeEqual(a, b)) return false;
	const exp = Number(payload);
	if (!Number.isFinite(exp) || exp < Date.now()) return false;
	return true;
}

/** Cookie attributes used at set-time. */
export const COOKIE_OPTIONS = {
	path: '/',
	httpOnly: true,
	sameSite: 'lax',
	secure: true,
	maxAge: SESSION_TTL_MS / 1000
} as const;
