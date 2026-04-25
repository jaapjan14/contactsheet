import { env } from '$env/dynamic/private';

export type RequiredEnvName = 'FLICKR_API_KEY' | 'FLICKR_API_SECRET';

export function requireEnv(name: RequiredEnvName): string {
	const v = env[name];
	if (!v) throw new Error(`${name} is not set in the environment`);
	return v;
}
