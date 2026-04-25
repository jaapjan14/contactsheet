import { error } from '@sveltejs/kit';
import { FlickrError } from '$lib/server/flickr/client';
import { resolveGroupId, getGroupInfo, getGroupPhotos } from '$lib/server/flickr/groups';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
	let groupId: string;
	try {
		groupId = await resolveGroupId(params.id);
	} catch (err) {
		if (err instanceof FlickrError) {
			throw error(404, `Group "${params.id}" not found on Flickr`);
		}
		throw err;
	}

	const [info, photos] = await Promise.all([
		getGroupInfo(groupId),
		getGroupPhotos(groupId, 1)
	]);

	return {
		groupKey: params.id,
		groupId,
		group: info,
		photos
	};
};
