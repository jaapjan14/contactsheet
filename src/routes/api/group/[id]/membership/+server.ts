import { error, json } from '@sveltejs/kit';
import { FlickrError } from '$lib/server/flickr/client';
import { readAuth } from '$lib/server/auth/store';
import {
	resolveGroupId,
	joinGroup,
	leaveGroup,
	getUserGroups
} from '$lib/server/flickr/groups';
import type { RequestHandler } from './$types';

/**
 * POST /api/group/[id]/membership   → join
 * DELETE /api/group/[id]/membership → leave
 *
 * Both require auth. Response is `{ member: boolean }` reflecting the new
 * state. The client uses this to flip its local button state without
 * needing to re-fetch people.getGroups (we invalidated the server cache).
 */

async function requireAuthedNsid(): Promise<string> {
	const auth = await readAuth();
	if (!auth) throw error(401, 'Sign in to Flickr first');
	return auth.nsid;
}

async function resolveOrThrow(idParam: string): Promise<string> {
	try {
		return await resolveGroupId(idParam);
	} catch (err) {
		if (err instanceof FlickrError) throw error(404, `Group "${idParam}" not found`);
		throw err;
	}
}

export const POST: RequestHandler = async ({ params, request }) => {
	const meNsid = await requireAuthedNsid();
	const groupId = await resolveOrThrow(params.id);

	let acceptRules = false;
	// Body is optional — old clients post without one.
	try {
		const body = (await request.json()) as { acceptRules?: boolean };
		acceptRules = body?.acceptRules === true;
	} catch {
		/* no body, that's fine */
	}

	try {
		await joinGroup(meNsid, groupId, { acceptRules });
	} catch (err) {
		if (err instanceof FlickrError) {
			// Code 99 = "User has not accepted rules for joining this group."
			// Surface as 409 so the client can show the rules modal and retry
			// with acceptRules:true. Distinct status from a generic upstream
			// error so the client doesn't have to string-match.
			if (err.code === 99 && !acceptRules) {
				return json({ error: 'rules_required' }, { status: 409 });
			}
			throw error(502, err.message);
		}
		throw err;
	}
	return json({ member: true });
};

export const DELETE: RequestHandler = async ({ params }) => {
	const meNsid = await requireAuthedNsid();
	const groupId = await resolveOrThrow(params.id);
	try {
		await leaveGroup(meNsid, groupId);
	} catch (err) {
		if (err instanceof FlickrError) throw error(502, err.message);
		throw err;
	}
	return json({ member: false });
};

/**
 * GET — read-only "am I in this group?" check. Returns
 * `{ signedIn, member }`. Used by the group page to pick the right
 * button state on first render.
 */
export const GET: RequestHandler = async ({ params }) => {
	const auth = await readAuth();
	if (!auth) return json({ signedIn: false, member: false });
	const groupId = await resolveOrThrow(params.id);
	try {
		const groups = await getUserGroups(auth.nsid);
		return json({
			signedIn: true,
			member: groups.some((g) => g.nsid === groupId)
		});
	} catch (err) {
		if (err instanceof FlickrError) {
			// e.g. user has no groups, or Flickr hiccup. Treat as "unknown" / not member.
			return json({ signedIn: true, member: false });
		}
		throw err;
	}
};
