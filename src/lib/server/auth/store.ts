import { readFile, writeFile, unlink, mkdir, rename } from 'node:fs/promises';
import { dirname } from 'node:path';

const AUTH_FILE = 'data/auth.json';

export interface AuthData {
	nsid: string;
	username: string;
	fullname?: string;
	access_token: string;
	access_token_secret: string;
	obtained_at: string;
}

export async function readAuth(): Promise<AuthData | null> {
	try {
		const raw = await readFile(AUTH_FILE, 'utf-8');
		return JSON.parse(raw) as AuthData;
	} catch (err) {
		if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
		throw err;
	}
}

export async function writeAuth(data: AuthData): Promise<void> {
	await mkdir(dirname(AUTH_FILE), { recursive: true });
	const tmp = `${AUTH_FILE}.tmp`;
	await writeFile(tmp, JSON.stringify(data, null, 2), 'utf-8');
	await rename(tmp, AUTH_FILE);
}

export async function clearAuth(): Promise<void> {
	try {
		await unlink(AUTH_FILE);
	} catch (err) {
		if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
	}
}

const requestTokenSecrets = new Map<string, { secret: string; expires: number }>();
const REQUEST_TOKEN_TTL_MS = 10 * 60 * 1000;

export function setRequestTokenSecret(token: string, secret: string): void {
	const expires = Date.now() + REQUEST_TOKEN_TTL_MS;
	requestTokenSecrets.set(token, { secret, expires });
	pruneRequestTokens();
}

export function takeRequestTokenSecret(token: string): string | undefined {
	pruneRequestTokens();
	const entry = requestTokenSecrets.get(token);
	if (!entry) return undefined;
	requestTokenSecrets.delete(token);
	return entry.secret;
}

function pruneRequestTokens(): void {
	const now = Date.now();
	for (const [token, entry] of requestTokenSecrets) {
		if (entry.expires < now) requestTokenSecrets.delete(token);
	}
}
