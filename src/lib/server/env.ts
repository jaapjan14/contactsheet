import { env } from '$env/dynamic/private';

export type RequiredEnvName =
	| 'FLICKR_API_KEY'
	| 'FLICKR_API_SECRET'
	| 'APP_PASSWORD'
	| 'SESSION_SECRET';

export function requireEnv(name: RequiredEnvName): string {
	const v = env[name];
	if (!v) throw new Error(`${name} is not set in the environment`);
	return v;
}

export function readEnv(name: string): string | undefined {
	return env[name];
}
