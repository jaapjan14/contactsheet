/**
 * Map known Flickr discussion error codes to friendlier messages.
 * Falls back to the raw Flickr message for codes we haven't catalogued.
 *
 * Returns status 422 (Unprocessable Entity) rather than 502 because
 * Cloudflare replaces 5xx response bodies with its own error page,
 * masking the JSON we want the client to read. 4xx codes pass through
 * unchanged. The cause is user/group state, not a server failure, so
 * 4xx is semantically right anyway.
 */
export interface DiscussErrorPayload {
	error: string;
	code: number;
	hint?: string;
}

const FRIENDLY: Record<number, { message: string; hint?: string }> = {
	1: {
		message: 'Not found.',
		hint: 'The topic or group may have been deleted.'
	},
	2: {
		message: "This group doesn't allow new posts here.",
		hint:
			'Discussions may be closed, restricted to admins, or you may not be a member.'
	},
	99: {
		message: "You don't have permission to do that.",
		hint: 'You may need to join the group, or accept group rules, before posting.'
	},
	100: { message: 'Invalid API key (server bug — please report).' },
	105: {
		message: 'Flickr is temporarily unavailable.',
		hint: 'Try again in a minute.'
	}
};

export function discussErrorResponse(
	flickrCode: number,
	flickrMessage: string
): { status: number; body: DiscussErrorPayload } {
	const friendly = FRIENDLY[flickrCode];
	return {
		status: 422,
		body: {
			error: friendly?.message ?? flickrMessage,
			code: flickrCode,
			hint: friendly?.hint
		}
	};
}
