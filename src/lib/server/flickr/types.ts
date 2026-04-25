export interface FlickrTextNode {
	_content: string;
}

export interface FlickrUserStub {
	id: string;
	nsid: string;
	username: FlickrTextNode;
}

export interface FlickrPersonInfo {
	id: string;
	nsid: string;
	ispro: number;
	iconserver: string;
	iconfarm: number;
	path_alias: string | null;
	username: FlickrTextNode;
	realname?: FlickrTextNode;
	location?: FlickrTextNode;
	description?: FlickrTextNode;
	photos?: {
		count: FlickrTextNode;
		firstdate?: FlickrTextNode;
		firstdatetaken?: FlickrTextNode;
		views?: FlickrTextNode;
	};
}

export interface FlickrPhotoSummary {
	id: string;
	owner: string;
	secret: string;
	server: string;
	farm: number;
	title: string;
	ispublic?: number;
	isfriend?: number;
	isfamily?: number;
	datetaken?: string;
	views?: string;
	tags?: string;
	url_z?: string;
	width_z?: string;
	height_z?: string;
	url_h?: string;
	width_h?: string;
	height_h?: string;
	url_k?: string;
	width_k?: string;
	height_k?: string;
	o_width?: string;
	o_height?: string;
}

export interface PhotosPage {
	page: number;
	pages: number;
	perpage: number;
	total: number;
	photo: FlickrPhotoSummary[];
}

export interface PeopleGetPhotosResponse {
	stat: string;
	photos: PhotosPage;
}

export interface PeopleGetInfoResponse {
	stat: string;
	person: FlickrPersonInfo;
}

export interface FlickrTag {
	id: string;
	author: string;
	authorname?: string;
	raw: string;
	_content: string;
	machine_tag: number;
}

export interface FlickrPhotoOwner {
	nsid: string;
	username: string;
	realname?: string;
	location?: string;
	iconserver?: string;
	iconfarm?: number;
	path_alias?: string | null;
}

export interface FlickrPhotoInfo {
	id: string;
	secret: string;
	server: string;
	farm: number;
	dateuploaded?: string;
	owner: FlickrPhotoOwner;
	title: FlickrTextNode;
	description: FlickrTextNode;
	visibility?: { ispublic: number; isfriend: number; isfamily: number };
	dates: {
		posted: string;
		taken: string;
		takengranularity?: string;
		lastupdate?: string;
	};
	views: string;
	media?: string;
	tags?: { tag: FlickrTag[] };
	location?: {
		latitude: number;
		longitude: number;
		accuracy: string;
		locality?: FlickrTextNode;
		county?: FlickrTextNode;
		region?: FlickrTextNode;
		country?: FlickrTextNode;
	};
	urls?: { url: { type: string; _content: string }[] };
}

export interface PhotosGetInfoResponse {
	stat: string;
	photo: FlickrPhotoInfo;
}

export interface FlickrSizeEntry {
	label: string;
	width: number;
	height: number;
	source: string;
	url: string;
	media: string;
}

export interface PhotosGetSizesResponse {
	stat: string;
	sizes: {
		canblog: number;
		canprint: number;
		candownload: number;
		size: FlickrSizeEntry[];
	};
}

export interface FlickrPhotoset {
	id: string;
	primary: string;
	secret: string;
	server: string;
	farm: number;
	photos: number | string;
	videos?: number;
	title: FlickrTextNode;
	description: FlickrTextNode;
	count_views: string;
	count_comments: string;
	date_create: string;
	date_update: string;
}

export interface PhotosetsList {
	page: number;
	pages: number;
	perpage: number;
	total: number | string;
	photoset: FlickrPhotoset[];
}

export interface PhotosetsGetListResponse {
	stat: string;
	photosets: PhotosetsList;
}

export interface PhotosetWithPhotos {
	id: string;
	primary: string;
	owner: string;
	ownername: string;
	page: number;
	per_page: number | string;
	perpage?: number | string;
	pages: number;
	total: number | string;
	title: string;
	photo: FlickrPhotoSummary[];
}

export interface PhotosetGetPhotosResponse {
	stat: string;
	photoset: PhotosetWithPhotos;
}

export interface FlickrExifEntry {
	tagspace: string;
	tagspaceid: number | string;
	tag: string;
	label: string;
	raw: FlickrTextNode;
	clean?: FlickrTextNode;
}

export interface PhotosGetExifResponse {
	stat: string;
	photo: {
		id: string;
		secret: string;
		server: string;
		farm: number;
		camera: string;
		exif: FlickrExifEntry[];
	};
}

export interface FlickrComment {
	id: string;
	author: string;
	author_is_deleted?: number;
	authorname: string;
	iconserver?: string;
	iconfarm?: number;
	datecreate: string;
	permalink: string;
	path_alias?: string | null;
	realname?: string;
	_content: string;
}

export interface PhotosCommentsGetListResponse {
	stat: string;
	comments: {
		photo_id: string;
		comment?: FlickrComment[];
	};
}

export interface FlickrGroupInfo {
	id: string;
	path_alias?: string | null;
	iconserver?: string;
	iconfarm?: number;
	name: FlickrTextNode;
	description?: FlickrTextNode;
	members: FlickrTextNode;
	pool_count?: FlickrTextNode;
	rules?: FlickrTextNode;
	throttle?: { count: number; mode: string; remaining: number };
	privacy?: number;
}

export interface GroupsGetInfoResponse {
	stat: string;
	group: FlickrGroupInfo;
}

export interface GroupsPoolGetPhotosResponse {
	stat: string;
	photos: PhotosPage;
}

export interface UrlsLookupGroupResponse {
	stat: string;
	group: { id: string; groupname: FlickrTextNode };
}

export interface FlickrGallery {
	id: string;
	url: string;
	owner: string;
	username?: string;
	primary_photo_id: string;
	primary_photo_server: string;
	primary_photo_farm?: number | string;
	primary_photo_secret: string;
	count_photos: number | string;
	count_videos?: number | string;
	count_views?: string;
	count_comments?: string;
	title: FlickrTextNode;
	description: FlickrTextNode;
	date_create: string;
	date_update: string;
}

export interface GalleriesList {
	page: number;
	pages: number;
	per_page: number | string;
	total: number | string;
	gallery: FlickrGallery[];
}

export interface GalleriesGetListResponse {
	stat: string;
	galleries: GalleriesList;
}

export interface GalleriesGetPhotosResponse {
	stat: string;
	photos: PhotosPage & { gallery_id?: string };
}

export interface GalleriesGetInfoResponse {
	stat: string;
	gallery: FlickrGallery;
}
