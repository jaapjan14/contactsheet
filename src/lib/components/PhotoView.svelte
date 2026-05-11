<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { goto, preloadData } from '$app/navigation';
	import { makeZoomer, type Zoomer } from '$lib/zoom';
	import { decodeFlickrEntities, sanitizeFlickrHtml } from '$lib/flickr/text';
	import { flickrShortUrl } from '$lib/flickr/urls';
	import type {
		FlickrPhotoInfo,
		FlickrSizeEntry,
		FlickrComment,
		PhotosGetExifResponse
	} from '$lib/server/flickr/types';
	import type { PhotoContexts } from '$lib/server/flickr/photos';
	import type { FlickrUserGroup } from '$lib/server/flickr/groups';

	export interface PhotoViewData {
		photo: FlickrPhotoInfo;
		display: FlickrSizeEntry;
		highRes: FlickrSizeEntry | null;
		maxRes: FlickrSizeEntry | null;
		photoSizes: FlickrSizeEntry[];
		exif: PhotosGetExifResponse['photo'] | null;
		comments: FlickrComment[];
		favesCount: number;
		contexts: PhotoContexts;
		myGroups?: FlickrUserGroup[];
		me?: { nsid: string; username: string; fullname?: string | null } | null;
	}

	// `onclose` and `onpaginate` are optional — when this component is mounted
	// inside the standalone /photo/[id] route, they're undefined and the
	// component falls through to its built-in goto/replaceState behavior. When
	// mounted inside <PhotoOverlay> (Darkroom-style modal pattern), the overlay
	// passes hooks so close → dismiss overlay (no route nav) and prev/next →
	// swap overlay data + replaceState URL (no route nav). Avoiding navigation
	// is the whole point: it's what eliminates Safari's deep-grid gray-screen
	// back-nav bug.
	let {
		data,
		onclose,
		onpaginate
	}: {
		data: PhotoViewData;
		onclose?: () => void;
		onpaginate?: (id: string) => void;
	} = $props();

	const photo = $derived(data.photo);
	const display = $derived(data.display);
	const ownerHref = $derived(
		`/user/${photo.owner.path_alias || photo.owner.nsid}/photostream`
	);
	const ownerName = $derived(photo.owner.realname || photo.owner.username);
	const tags = $derived(photo.tags?.tag.filter((t) => !t.machine_tag) ?? []);
	const flickrPageUrl = $derived(
		photo.urls?.url.find((u) => u.type === 'photopage')?._content
	);
	const isOwner = $derived(data.me?.nsid === photo.owner.nsid);

	const contextLabel = $derived.by((): string => {
		if (!streamCtx) return `${ownerName}'s photostream`;
		if (streamCtx.albumId) return 'album';
		if (streamCtx.groupId) return 'group';
		if (streamCtx.galleryId) return 'gallery';
		if (streamCtx.searchPath) return 'search results';
		if (streamCtx.explorePath) return 'Explore';
		const map: Record<string, string> = {
			photostream: 'photostream',
			albums: 'albums',
			faves: 'faves',
			galleries: 'galleries',
			groups: 'groups',
			'camera-roll': 'camera roll',
			stats: 'stats'
		};
		return map[streamCtx.tab] ?? streamCtx.tab;
	});

	// Local copies that update on save — keeps UI snappy without a full page reload
	let liveTitle = $state(untrack(() => data.photo.title._content || ''));
	let liveDesc = $state(untrack(() => data.photo.description._content || ''));
	// Flickr descriptions arrive as HTML (mostly <a>, <br>) with entity-encoded
	// chars. Decode the entities first, then sanitize to a safe whitelist —
	// otherwise `<a href=...>Instagram</a>` renders as literal text.
	const liveDescHtml = $derived(sanitizeFlickrHtml(decodeFlickrEntities(liveDesc)).trim());
	let lastPhotoId = $state(untrack(() => data.photo.id));

	$effect(() => {
		if (data.photo.id !== lastPhotoId) {
			lastPhotoId = data.photo.id;
			liveTitle = data.photo.title._content || '';
			liveDesc = data.photo.description._content || '';
		}
	});

	let editingTitle = $state(false);
	let editingDesc = $state(false);
	let titleDraft = $state('');
	let descDraft = $state('');
	let saving = $state(false);
	let saveError: string | null = $state(null);

	// Like/unlike — initial state defaults to "not faved"; the toggle is
	// intent-based, the server folds Flickr's "already faved" / "not faved"
	// errors into success so the first click flips the visible state correctly.
	let faved = $state(false);
	let faving = $state(false);
	let faveCount = $state(untrack(() => data.favesCount));

	// Comment compose + live comment list (initialized from server data,
	// updated optimistically on submit so the user sees their comment immediately).
	let liveComments = $state(untrack(() => data.comments));
	let commentDraft = $state('');
	let posting = $state(false);
	let commentError: string | null = $state(null);

	// Share / BBCode — pick a sensible default size (largest non-Original ≤1600,
	// matching what Flickr's BBCode tab opens to). Falls back to the biggest
	// available photo size if nothing fits.
	const sharePhotoSizes = $derived(data.photoSizes ?? []);
	const defaultShareSizeSource = $derived.by(() => {
		const list = sharePhotoSizes.filter((s) => s.label !== 'Original');
		const fit = [...list].filter((s) => s.width <= 1600).sort((a, b) => b.width - a.width)[0];
		const big = [...list].sort((a, b) => b.width - a.width)[0];
		return (fit ?? big ?? sharePhotoSizes[0])?.source ?? '';
	});
	let shareSizeSource = $state(untrack(() => defaultShareSizeSource));
	const shortUrl = $derived(flickrShortUrl(photo.id));
	const bbcode = $derived(
		shareSizeSource ? `[url=${shortUrl}][img]${shareSizeSource}[/img][/url]` : ''
	);
	let copied = $state(false);
	let copyError: string | null = $state(null);

	async function copyBbcode() {
		copyError = null;
		try {
			await navigator.clipboard.writeText(bbcode);
			copied = true;
			setTimeout(() => (copied = false), 1500);
		} catch (err) {
			copyError = (err as Error).message;
		}
	}

	// Add-to-group typeahead. Filters Jacob's own group memberships (loaded
	// server-side as `data.myGroups`) by name. Already-in and pending-moderation
	// groups stay in the list with a status icon so a "leica"-style search
	// keeps showing all matches as he batch-adds across them — the query
	// persists across clicks for that reason.
	let liveGroups = $state(untrack(() => data.contexts?.groups ?? []));
	let pendingGroupIds = $state(new Set<string>());
	let groupQuery = $state('');
	let addingGroupId: string | null = $state(null);
	let addGroupError: string | null = $state(null);
	let removingGroupId: string | null = $state(null);
	let removeGroupError: string | null = $state(null);

	type GroupStatus = 'addable' | 'added' | 'pending';
	function statusOf(g: FlickrUserGroup): GroupStatus {
		if (liveGroups.some((lg) => lg.id === g.nsid)) return 'added';
		if (pendingGroupIds.has(g.nsid)) return 'pending';
		return 'addable';
	}

	const groupCandidates = $derived.by(() => {
		const all = data.myGroups ?? [];
		const q = groupQuery.trim().toLowerCase();
		if (!q) {
			// No query: show all addable groups, alphabetized. The scroll container
			// handles the visual constraint so a tall list is fine.
			return all.filter((g) => statusOf(g) === 'addable');
		}
		return all.filter((g) => g.name.toLowerCase().includes(q));
	});
	const addableMatchCount = $derived(
		groupCandidates.filter((g) => statusOf(g) === 'addable').length
	);

	async function addToGroup(group: FlickrUserGroup) {
		if (addingGroupId) return;
		if (statusOf(group) !== 'addable') return;
		addingGroupId = group.nsid;
		addGroupError = null;
		try {
			const res = await fetch(`/api/photo/${photo.id}/groups`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ groupId: group.nsid })
			});
			if (!res.ok) {
				// Cloudflare 502 / origin timeouts come back as HTML — don't render
				// that into the sidebar. SvelteKit's own thrown errors arrive as
				// `{message}` JSON; pick that out when it's there.
				let msg = `HTTP ${res.status}`;
				const ct = res.headers.get('content-type') ?? '';
				if (ct.includes('application/json')) {
					try {
						const body = (await res.json()) as { message?: string; error?: string };
						msg = body.message || body.error || msg;
					} catch {
						/* fall through to generic */
					}
				} else if (res.status === 502 || res.status === 504) {
					msg = 'Network hiccup — try again.';
				}
				throw new Error(msg);
			}
			const result = (await res.json()) as { queued?: boolean; alreadyIn?: boolean };
			if (result.queued) {
				pendingGroupIds = new Set(pendingGroupIds).add(group.nsid);
			} else {
				liveGroups = [
					...liveGroups,
					{ id: group.nsid, title: decodeFlickrEntities(group.name) }
				];
			}
			// Keep groupQuery so user can keep adding across the same filter.
		} catch (err) {
			addGroupError = (err as Error).message;
		} finally {
			addingGroupId = null;
		}
	}

	async function removeFromGroup(group: { id: string; title: string }) {
		if (removingGroupId) return;
		removingGroupId = group.id;
		removeGroupError = null;
		try {
			const res = await fetch(`/api/photo/${photo.id}/groups`, {
				method: 'DELETE',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ groupId: group.id })
			});
			if (!res.ok) {
				let msg = `HTTP ${res.status}`;
				const ct = res.headers.get('content-type') ?? '';
				if (ct.includes('application/json')) {
					try {
						const body = (await res.json()) as { message?: string; error?: string };
						msg = body.message || body.error || msg;
					} catch {
						/* fall through */
					}
				} else if (res.status === 502 || res.status === 504) {
					msg = 'Network hiccup — try again.';
				}
				throw new Error(msg);
			}
			liveGroups = liveGroups.filter((g) => g.id !== group.id);
			// If we had it queued for moderation, clear that too — defensive.
			if (pendingGroupIds.has(group.id)) {
				const next = new Set(pendingGroupIds);
				next.delete(group.id);
				pendingGroupIds = next;
			}
		} catch (err) {
			removeGroupError = (err as Error).message;
		} finally {
			removingGroupId = null;
		}
	}

	let lastCommentPhotoId = $state(untrack(() => data.photo.id));
	$effect(() => {
		if (data.photo.id !== lastCommentPhotoId) {
			lastCommentPhotoId = data.photo.id;
			liveComments = data.comments;
			commentDraft = '';
			faved = false;
			faveCount = data.favesCount;
			shareSizeSource = defaultShareSizeSource;
			copied = false;
			liveGroups = data.contexts?.groups ?? [];
			pendingGroupIds = new Set();
			groupQuery = '';
			addGroupError = null;
			removeGroupError = null;
		}
	});

	async function toggleFave() {
		if (faving || !data.me) return;
		const wasFaved = faved;
		faving = true;
		faved = !wasFaved; // optimistic
		faveCount = Math.max(0, faveCount + (wasFaved ? -1 : 1));
		try {
			const res = await fetch(`/api/photo/${photo.id}/fave`, {
				method: wasFaved ? 'DELETE' : 'POST'
			});
			if (!res.ok) throw new Error(await res.text());
		} catch (err) {
			faved = wasFaved; // rollback
			faveCount = Math.max(0, faveCount + (wasFaved ? 1 : -1));
			console.error('fave toggle failed', err);
		} finally {
			faving = false;
		}
	}

	async function submitComment(e: SubmitEvent) {
		e.preventDefault();
		const text = commentDraft.trim();
		if (!text || posting || !data.me) return;
		posting = true;
		commentError = null;
		try {
			const res = await fetch(`/api/photo/${photo.id}/comments`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ text })
			});
			if (!res.ok) throw new Error(await res.text());
			const { commentId } = (await res.json()) as { commentId: string };
			liveComments = [
				...liveComments,
				{
					id: commentId,
					author: data.me.nsid,
					authorname: data.me.username,
					realname: data.me.fullname || data.me.username,
					datecreate: String(Math.floor(Date.now() / 1000)),
					permalink: '',
					_content: text,
					path_alias: data.me.username
				}
			];
			commentDraft = '';
		} catch (err) {
			commentError = (err as Error).message;
		} finally {
			posting = false;
		}
	}

	function startEditTitle() {
		titleDraft = liveTitle;
		editingTitle = true;
	}
	function startEditDesc() {
		descDraft = liveDesc;
		editingDesc = true;
	}
	function cancelEdit() {
		editingTitle = false;
		editingDesc = false;
		saveError = null;
	}

	async function save() {
		if (saving) return;
		saving = true;
		saveError = null;
		const newTitle = editingTitle ? titleDraft : liveTitle;
		const newDesc = editingDesc ? descDraft : liveDesc;
		try {
			const res = await fetch(`/api/photo/${photo.id}/meta`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ title: newTitle, description: newDesc })
			});
			if (!res.ok) {
				const text = await res.text();
				throw new Error(text || `HTTP ${res.status}`);
			}
			liveTitle = newTitle;
			liveDesc = newDesc;
			editingTitle = false;
			editingDesc = false;
		} catch (err) {
			saveError = (err as Error).message;
		} finally {
			saving = false;
		}
	}

	const shotDetails = $derived.by(() => {
		if (!data.exif) return null;
		const find = (tag: string): string | null => {
			const e = data.exif!.exif.find((x) => x.tag === tag);
			return e?.clean?._content ?? e?.raw._content ?? null;
		};
		const detail = {
			camera: data.exif.camera || null,
			lens: find('LensModel') ?? find('Lens'),
			focal: find('FocalLength'),
			aperture: find('FNumber'),
			shutter: find('ExposureTime'),
			iso: find('ISO') ?? find('ISOSpeedRatings')
		};
		const hasAny = Object.values(detail).some((v) => v);
		return hasAny ? detail : null;
	});

	function decodeAndStripHtml(s: string): string {
		// Strip tags first, then decode the most common entities
		const stripped = s.replace(/<[^>]+>/g, '');
		return stripped
			.replace(/&amp;/g, '&')
			.replace(/&lt;/g, '<')
			.replace(/&gt;/g, '>')
			.replace(/&quot;/g, '"')
			.replace(/&#39;/g, "'");
	}

	function formatCommentDate(epoch: string): string {
		const ms = parseInt(epoch, 10) * 1000;
		if (!Number.isFinite(ms)) return '';
		return new Date(ms).toLocaleDateString(undefined, {
			year: 'numeric',
			month: 'short',
			day: 'numeric'
		});
	}

	type StreamCtx =
		| { ids: string[]; userKey: string; tab: string; albumId?: undefined; groupId?: undefined; galleryId?: undefined; searchPath?: undefined; explorePath?: undefined }
		| { ids: string[]; albumId: string; tab: 'album'; userKey?: undefined; groupId?: undefined; galleryId?: undefined; searchPath?: undefined; explorePath?: undefined }
		| { ids: string[]; groupId: string; tab: 'group'; userKey?: undefined; albumId?: undefined; galleryId?: undefined; searchPath?: undefined; explorePath?: undefined }
		| { ids: string[]; galleryId: string; tab: 'gallery'; userKey?: undefined; albumId?: undefined; groupId?: undefined; searchPath?: undefined; explorePath?: undefined }
		| { ids: string[]; searchPath: string; tab: 'search'; userKey?: undefined; albumId?: undefined; groupId?: undefined; galleryId?: undefined; explorePath?: undefined }
		| { ids: string[]; explorePath: string; tab: 'explore'; userKey?: undefined; albumId?: undefined; groupId?: undefined; galleryId?: undefined; searchPath?: undefined };

	let streamCtx = $state<StreamCtx | null>(null);
	let position = $derived(streamCtx ? streamCtx.ids.indexOf(photo.id) : -1);
	let prevId = $derived(streamCtx && position > 0 ? streamCtx.ids[position - 1] : null);
	let nextId = $derived(
		streamCtx && position >= 0 && position < streamCtx.ids.length - 1
			? streamCtx.ids[position + 1]
			: null
	);
	let backHref = $derived(
		streamCtx
			? streamCtx.albumId
				? `/album/${streamCtx.albumId}`
				: streamCtx.groupId
					? `/group/${streamCtx.groupId}`
					: streamCtx.galleryId
						? `/gallery/${streamCtx.galleryId}`
						: streamCtx.searchPath
							? streamCtx.searchPath
							: streamCtx.explorePath
								? streamCtx.explorePath
								: `/user/${streamCtx.userKey}/${streamCtx.tab}`
			: ownerHref
	);

	let fullscreen = $state(false);
	let figureEl: HTMLElement | null = $state(null);
	let imgEl: HTMLImageElement | null = $state(null);
	let zoomer: Zoomer | null = null;
	function isZoomed() {
		return zoomer?.isZoomed() ?? false;
	}

	// Horizontal swipe = page prev/next; vertical = swipe-up-to-close.
	// Horizontal threshold bumped to 180 so casual two-finger motion (which on
	// macOS competes with the browser back-gesture) doesn't accidentally page.
	// Vertical threshold matches Darkroom Log's library tab (-80 cumulative
	// deltaY).
	const SWIPE_PX = 180;
	const VERT_CLOSE_PX = 80;
	let cooldownUntil = 0;
	let wheelAccumX = 0;
	let wheelAccumY = 0;

	function pageTo(id: string | null) {
		if (!id) return;
		const now = Date.now();
		if (now < cooldownUntil) return;
		cooldownUntil = now + 350;
		zoomer?.reset();
		// In overlay mode, hand off to the overlay so it can swap data + update
		// URL via replaceState without triggering a route navigation. In route
		// mode, fall through to the original goto-replaceState path.
		if (onpaginate) {
			onpaginate(id);
			return;
		}
		// replaceState so the grid stays one history step away no matter how many
		// photos the user pages through — Esc / X / swipe-down restore the grid scroll
		goto(`/photo/${id}`, { replaceState: true, noScroll: true });
	}

	function close() {
		// In overlay mode, the overlay's onclose pops the pushState entry —
		// no real navigation happens, which dodges Safari's deep-grid scroll-
		// restore gray-screen bug entirely.
		if (onclose) {
			onclose();
			return;
		}
		// Standalone-route fallback: `streamCtx` is set on grid pages and
		// persists in sessionStorage for this tab. Its presence is the strong
		// signal that the lightbox was entered from a grid one history step
		// back — `history.back()` restores SvelteKit's saved scroll position
		// to that grid natively.
		if (typeof window !== 'undefined' && streamCtx && window.history.length > 1) {
			window.history.back();
		} else {
			goto(backHref);
		}
	}

	// Cascading "back" — same priority Esc has used all along: cancel zoom,
	// then exit fullscreen, then leave the photo entirely. Used by the ✕
	// button and the swipe/wheel close gestures so a single dismiss action
	// from inside fullscreen drops you on the photo info page (with EXIF,
	// comments, etc.), not all the way back to the grid. A second dismiss
	// from the info page goes to the grid.
	function backOrClose() {
		if (isZoomed()) {
			zoomer?.reset();
			return;
		}
		if (fullscreen) {
			fullscreen = false;
			return;
		}
		close();
	}

	function onFigureClick(e: MouseEvent) {
		const target = e.target as HTMLElement;
		// Don't toggle fullscreen if the click landed on a nav arrow or icon button
		if (target.closest('a.nav, .iconbtn')) return;
		// While zoomed in, a click should NOT collapse fullscreen — the user
		// is interacting with the zoomed image. They can double-click to reset
		// or hit Esc; that's our "exit zoom" affordance.
		if (isZoomed()) return;
		// In fullscreen, a single click is reserved for "potential first half of
		// a double-click-to-zoom" — exiting on it would race with dblclick and
		// produce a bounce. Use ✕, Esc, or swipe-↕ to exit fullscreen instead.
		if (fullscreen) return;
		fullscreen = true;
	}

	function onNavClick(e: MouseEvent, id: string | null) {
		// Allow cmd/middle/shift-click to open in new tab as usual
		if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
		e.preventDefault();
		pageTo(id);
	}

	onMount(() => {
		try {
			const raw = sessionStorage.getItem('contactsheet:stream');
			if (raw) {
				const parsed = JSON.parse(raw);
				// Only honor a stashed streamCtx that actually contains THIS
				// photo. Otherwise it's stale — the user navigated to some
				// other grid (e.g. clicked an owner avatar from a photo, then
				// hit back, then opened another photo) and the leftover
				// context would silently send "close" to the wrong page. We'd
				// rather fall through to ownerHref than land on a feed/album
				// the user hasn't been on for several clicks.
				if (parsed && Array.isArray(parsed.ids) && parsed.ids.includes(photo.id)) {
					streamCtx = parsed;
				}
			}
		} catch {
			/* ignore */
		}

		const handler = (e: KeyboardEvent) => {
			if (e.metaKey || e.ctrlKey || e.altKey) return;
			// Don't hijack keys while the user is typing in an input/textarea
			// (group search, comment compose, title/description edits) — F would
			// open fullscreen mid-word, arrows would page the photo, etc.
			const target = e.target as HTMLElement | null;
			if (target) {
				const tag = target.tagName;
				if (tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable) return;
			}
			if (e.key === 'ArrowLeft') {
				e.preventDefault();
				pageTo(prevId);
			} else if (e.key === 'ArrowRight') {
				e.preventDefault();
				pageTo(nextId);
			} else if (e.key === 'Escape') {
				e.preventDefault();
				if (isZoomed()) zoomer?.reset();
				else if (fullscreen) fullscreen = false;
				else close();
			} else if (e.key === 'f' || e.key === 'F') {
				e.preventDefault();
				fullscreen = !fullscreen;
			}
		};
		window.addEventListener('keydown', handler);
		return () => window.removeEventListener('keydown', handler);
	});

	$effect(() => {
		if (!figureEl) return;

		const onWheel = (e: WheelEvent) => {
			// While zoomed, the zoomer owns the wheel — let it pan/zoom.
			if (isZoomed()) return;

			const absX = Math.abs(e.deltaX);
			const absY = Math.abs(e.deltaY);

			// Vertical-dominated motion: track for swipe-up-to-close.
			// Don't preventDefault — let the browser scroll if there's anything
			// scrollable nearby (the metadata aside, mostly).
			if (absY > absX * 1.5) {
				wheelAccumX = 0;
				if (Date.now() < cooldownUntil) return;
				wheelAccumY += e.deltaY;
				if (wheelAccumY < -VERT_CLOSE_PX && absX < 40) {
					wheelAccumY = 0;
					cooldownUntil = Date.now() + 350;
					backOrClose();
				}
				return;
			}

			// Horizontal-dominated motion: page prev/next.
			if (absX < absY * 1.2) {
				wheelAccumX = 0;
				wheelAccumY = 0;
				return;
			}
			e.preventDefault();
			if (Date.now() < cooldownUntil) return;
			wheelAccumY = 0;
			wheelAccumX += e.deltaX;
			if (wheelAccumX > SWIPE_PX) {
				wheelAccumX = 0;
				pageTo(nextId);
			} else if (wheelAccumX < -SWIPE_PX) {
				wheelAccumX = 0;
				pageTo(prevId);
			}
		};

		let touchStartX = 0;
		let touchStartY = 0;
		// Track whether any multi-touch gesture happened during this stroke.
		// Without this, lifting fingers from a pinch in different order made
		// `e.changedTouches[0].clientX - touchStartX` measure (finger#2's end −
		// finger#1's start), which can be a huge "swipe" and trigger close.
		let multiTouchSeen = false;
		const onTouchStart = (e: TouchEvent) => {
			if (e.touches.length === 1) {
				touchStartX = e.touches[0].clientX;
				touchStartY = e.touches[0].clientY;
				multiTouchSeen = false;
			} else {
				multiTouchSeen = true;
			}
		};
		const onTouchEnd = (e: TouchEvent) => {
			// While zoomed, pans should not be reinterpreted as paging or close
			// gestures. The zoomer owns single-finger drag in that mode.
			if (isZoomed()) return;
			// Pinch / multi-finger: not a swipe — bail.
			if (multiTouchSeen) return;
			const dx = e.changedTouches[0].clientX - touchStartX;
			const dy = e.changedTouches[0].clientY - touchStartY;
			const absX = Math.abs(dx);
			const absY = Math.abs(dy);
			// Vertical swipe (either direction) — first exits fullscreen if we're
			// in it, otherwise closes back to the grid. Mirrors the Esc cascade.
			if (absY > SWIPE_PX && absY > absX * 1.5) {
				if (Date.now() < cooldownUntil) return;
				cooldownUntil = Date.now() + 350;
				backOrClose();
				return;
			}
			// Horizontal swipe pages
			if (absX > SWIPE_PX && absX > absY * 1.5) {
				pageTo(dx < 0 ? nextId : prevId);
			}
		};

		figureEl.addEventListener('wheel', onWheel, { passive: false });
		figureEl.addEventListener('touchstart', onTouchStart, { passive: true });
		figureEl.addEventListener('touchend', onTouchEnd, { passive: true });
		return () => {
			figureEl?.removeEventListener('wheel', onWheel);
			figureEl?.removeEventListener('touchstart', onTouchStart);
			figureEl?.removeEventListener('touchend', onTouchEnd);
		};
	});

	$effect(() => {
		if (prevId) preloadData(`/photo/${prevId}`);
		if (nextId) preloadData(`/photo/${nextId}`);
	});

	// Zoom is only active in fullscreen — the lightbox view at 1× still has
	// the metadata sidebar visible, where pinch/drag would feel out of place.
	// Reading `data.photo.id` ties the effect to the current photo so paging
	// to a new image tears down + rebuilds the zoomer (resetting transform).
	$effect(() => {
		void data.photo.id;
		if (!fullscreen || !imgEl) return;
		const target = imgEl;
		// Wait until the image is laid out so offsetLeft/clientWidth are real.
		const attach = () => {
			zoomer = makeZoomer(target);
		};
		if (target.complete && target.naturalWidth > 0) {
			attach();
		} else {
			target.addEventListener('load', attach, { once: true });
		}
		return () => {
			target.removeEventListener('load', attach);
			zoomer?.destroy();
			zoomer = null;
		};
	});

	// Two-tier progressive high-res swap. <img src={imgSrc}> is reactive.
	//   stage 'display' → 2048 _k.jpg (initial render, fast)
	//   stage 'highRes' → X-Large 6K _6k.jpg (~1 MB, swaps in ~1 sec)
	//   stage 'maxRes'  → Original _o.jpg (15-40 MB, matches Flickr's viewer
	//                                       pixel-for-pixel; arrives in 10-30s)
	// We can't use imperative `target.src = url` — the bound expression
	// `src={imgSrc}` re-applies on every reactive tick and would yank src
	// back to display.source.
	type Stage = 'display' | 'highRes' | 'maxRes';
	let imgStage = $state<Stage>('display');
	$effect(() => {
		void data.photo.id;
		imgStage = 'display';
	});

	// Stage 1: load the mid-tier 6K. Runs as soon as fullscreen is entered.
	$effect(() => {
		if (!fullscreen) return;
		if (imgStage !== 'display') return;
		if (!data.highRes) return;
		const url = data.highRes.source;
		const photoIdAtStart = data.photo.id;
		const preloader = new Image();
		let cancelled = false;
		preloader.onload = () => {
			if (cancelled) return;
			if (data.photo.id !== photoIdAtStart) return;
			imgStage = 'highRes';
		};
		preloader.onerror = () => {
			if (cancelled) return;
			console.warn('highRes preload failed', url);
		};
		preloader.src = url;
		return () => {
			cancelled = true;
			preloader.onload = null;
			preloader.onerror = null;
		};
	});

	// Stage 2: once 6K is in (or there is no 6K), start chasing the Original
	// in the background. Big file — but at the point this fires the user
	// already has a sharp 6K to look at, so the long load is non-blocking.
	$effect(() => {
		if (!fullscreen) return;
		if (imgStage !== 'highRes' && data.highRes) return;
		if (imgStage === 'maxRes') return;
		if (!data.maxRes) return;
		const url = data.maxRes.source;
		const photoIdAtStart = data.photo.id;
		const preloader = new Image();
		let cancelled = false;
		preloader.onload = () => {
			if (cancelled) return;
			if (data.photo.id !== photoIdAtStart) return;
			imgStage = 'maxRes';
		};
		preloader.onerror = () => {
			if (cancelled) return;
			console.warn('maxRes preload failed', url);
		};
		preloader.src = url;
		return () => {
			cancelled = true;
			preloader.onload = null;
			preloader.onerror = null;
		};
	});

	const imgSrc = $derived.by(() => {
		if (!fullscreen) return display.source;
		if (imgStage === 'maxRes' && data.maxRes) return data.maxRes.source;
		if (imgStage === 'highRes' && data.highRes) return data.highRes.source;
		return display.source;
	});
</script>

<article class:fullscreen>
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
	<figure bind:this={figureEl} onclick={onFigureClick}>
		<img
			bind:this={imgEl}
			src={imgSrc}
			width={display.width}
			height={display.height}
			alt={photo.title._content}
		/>
		{#if prevId}
			<a
				class="nav prev"
				href="/photo/{prevId}"
				onclick={(e) => onNavClick(e, prevId)}
				aria-label="Previous photo"
			>
				‹
			</a>
		{/if}
		{#if nextId}
			<a
				class="nav next"
				href="/photo/{nextId}"
				onclick={(e) => onNavClick(e, nextId)}
				aria-label="Next photo"
			>
				›
			</a>
		{/if}
		{#if streamCtx && position >= 0}
			<span class="counter">{position + 1} / {streamCtx.ids.length}</span>
		{/if}
		{#if data.me}
			<button
				type="button"
				class="iconbtn fave"
				class:active={faved}
				onclick={toggleFave}
				disabled={faving}
				aria-label={faved ? 'Remove from faves' : 'Add to faves'}
				title={faved ? 'Faved' : 'Add to faves'}
			>
				{faved ? '♥' : '♡'}
			</button>
		{/if}
		<button
			type="button"
			class="iconbtn full"
			onclick={() => (fullscreen = !fullscreen)}
			aria-label={fullscreen ? 'Exit fullscreen' : 'Fullscreen'}
			title="Fullscreen (F)"
		>
			{#if fullscreen}⤢{:else}⤡{/if}
		</button>
		<button type="button" class="iconbtn close" onclick={backOrClose} aria-label="Close" title="Close (Esc)">
			✕
		</button>
	</figure>
	<aside>
		<button type="button" class="back-link" onclick={close}>
			← Back to {contextLabel}
		</button>

		{#if editingTitle}
			<form class="edit" onsubmit={(e) => { e.preventDefault(); save(); }}>
				<!-- svelte-ignore a11y_autofocus -->
				<input
					class="edit-title"
					type="text"
					bind:value={titleDraft}
					maxlength="200"
					placeholder="Untitled"
					autofocus
				/>
			</form>
		{:else}
			<h1>
				{liveTitle || 'Untitled'}
				{#if isOwner}
					<button
						type="button"
						class="edit-btn"
						onclick={startEditTitle}
						aria-label="Edit title"
						title="Edit title"
					>
						✎
					</button>
				{/if}
			</h1>
		{/if}
		<p class="byline">
			by <a href={ownerHref}>{ownerName}</a>
			{#if photo.dates.taken} · <time>{photo.dates.taken.split(' ')[0]}</time>{/if}
			{#if photo.views} · {Number(photo.views).toLocaleString()} views{/if}
			· {faveCount.toLocaleString()} {faveCount === 1 ? 'fave' : 'faves'}
			{#if liveComments.length > 0} · {liveComments.length}
				{liveComments.length === 1 ? 'comment' : 'comments'}{/if}
		</p>

		{#if editingDesc}
			<form class="edit" onsubmit={(e) => { e.preventDefault(); save(); }}>
				<textarea
					class="edit-desc"
					bind:value={descDraft}
					rows="6"
					placeholder="Description"
				></textarea>
			</form>
		{:else if liveDescHtml}
			<p class="desc">
				<!-- Sanitized HTML — only safe tags survive; CSP blocks any inline scripts. -->
				<!-- eslint-disable-next-line svelte/no-at-html-tags -->
				{@html liveDescHtml}
				{#if isOwner}
					<button
						type="button"
						class="edit-btn inline"
						onclick={startEditDesc}
						aria-label="Edit description"
						title="Edit description"
					>
						✎
					</button>
				{/if}
			</p>
		{:else if isOwner}
			<p class="desc empty">
				<button
					type="button"
					class="edit-btn-text"
					onclick={startEditDesc}
				>
					+ add description
				</button>
			</p>
		{/if}

		{#if editingTitle || editingDesc}
			<div class="edit-actions">
				<button class="btn primary" onclick={save} disabled={saving}>
					{saving ? 'saving…' : 'save'}
				</button>
				<button class="btn" onclick={cancelEdit} disabled={saving}>cancel</button>
				{#if saveError}
					<span class="save-error">{saveError}</span>
				{/if}
			</div>
		{/if}

		{#if photo.location}
			<p class="loc">
				📍
				{[
					photo.location.locality?._content,
					photo.location.region?._content,
					photo.location.country?._content
				]
					.filter(Boolean)
					.join(', ')}
			</p>
		{/if}

		{#if shotDetails}
			<details class="discl shot-discl">
				<summary>
					Shot details
					{#if shotDetails.camera}<span class="discl-tag">{shotDetails.camera}</span>{/if}
				</summary>
				<dl class="shot-dl">
					{#if shotDetails.camera}
						<dt>Camera</dt>
						<dd>{shotDetails.camera}</dd>
					{/if}
					{#if shotDetails.lens}
						<dt>Lens</dt>
						<dd>{shotDetails.lens}</dd>
					{/if}
					{#if shotDetails.focal}
						<dt>Focal</dt>
						<dd>{shotDetails.focal}</dd>
					{/if}
					{#if shotDetails.aperture}
						<dt>Aperture</dt>
						<dd>{shotDetails.aperture}</dd>
					{/if}
					{#if shotDetails.shutter}
						<dt>Shutter</dt>
						<dd>{shotDetails.shutter}</dd>
					{/if}
					{#if shotDetails.iso}
						<dt>ISO</dt>
						<dd>{shotDetails.iso}</dd>
					{/if}
				</dl>
			</details>
		{/if}

		{#if data.contexts && data.contexts.albums.length > 0}
			<details class="discl">
				<summary>
					In albums
					<span class="discl-count">{data.contexts.albums.length}</span>
				</summary>
				<ul class="context-list">
					{#each data.contexts.albums as a (a.id)}
						<li>
							<a href="/album/{a.id}">
								{decodeFlickrEntities(a.title)}
							</a>
							{#if a.count_photo}
								<span class="ctx-count">· {a.count_photo} photos</span>
							{/if}
						</li>
					{/each}
				</ul>
			</details>
		{/if}

		{#if liveGroups.length > 0}
			<details class="discl">
				<summary>
					In groups
					<span class="discl-count">{liveGroups.length}</span>
				</summary>
				<ul class="context-list">
					{#each liveGroups as g (g.id)}
						<li class="ctx-row">
							<a href="/group/{g.id}">
								{decodeFlickrEntities(g.title)}
							</a>
							{#if isOwner}
								<button
									type="button"
									class="ctx-remove"
									title={`Remove this photo from ${decodeFlickrEntities(g.title)}`}
									aria-label={`Remove from ${decodeFlickrEntities(g.title)}`}
									disabled={removingGroupId === g.id}
									onclick={() => removeFromGroup(g)}
								>
									{removingGroupId === g.id ? '…' : '×'}
								</button>
							{/if}
						</li>
					{/each}
				</ul>
				{#if removeGroupError}
					<p class="empty-comments">{removeGroupError}</p>
				{/if}
			</details>
		{/if}

		{#if isOwner && data.myGroups && data.myGroups.length > 0}
			<details class="discl">
				<summary>
					Add to group
					{#if groupQuery && addableMatchCount > 0}
						<span class="discl-count">{addableMatchCount}</span>
					{/if}
				</summary>
				<div class="add-group-body">
					<input
						type="text"
						class="group-search"
						placeholder="Search your groups…"
						bind:value={groupQuery}
						autocomplete="off"
					/>
					{#if groupCandidates.length === 0}
						<p class="empty-comments">
							{groupQuery
								? `No groups match "${groupQuery}".`
								: 'You\'re already in every one of your groups for this photo.'}
						</p>
					{:else}
						<ul class="group-list">
							{#each groupCandidates as g (g.nsid)}
								{@const status = statusOf(g)}
								{@const displayName = decodeFlickrEntities(g.name)}
								<li>
									<button
										type="button"
										class="group-row"
										class:is-added={status === 'added'}
										class:is-pending={status === 'pending'}
										onclick={() => addToGroup(g)}
										disabled={addingGroupId !== null || status !== 'addable'}
										title={status === 'added'
											? 'Already in this group'
											: status === 'pending'
												? 'Awaiting moderator approval'
												: `Add to ${displayName}`}
									>
										<span class="group-name">{displayName}</span>
										<span class="group-add-hint">
											{#if addingGroupId === g.nsid}
												adding…
											{:else if status === 'added'}
												✓ added
											{:else if status === 'pending'}
												⏳ pending
											{:else}
												+ add
											{/if}
										</span>
									</button>
								</li>
							{/each}
						</ul>
					{/if}
					{#if addGroupError}
						<p class="save-error">{addGroupError}</p>
					{/if}
				</div>
			</details>
		{/if}

		{#if sharePhotoSizes.length > 0}
			<details class="discl share-discl">
				<summary>Share / BBCode</summary>
				<div class="share-body">
					<label class="share-label" for="share-size">Size</label>
					<select id="share-size" class="share-size" bind:value={shareSizeSource}>
						{#each sharePhotoSizes as s (s.source)}
							<option value={s.source}>{s.label} ({s.width} × {s.height})</option>
						{/each}
					</select>
					<textarea
						class="share-bbcode"
						readonly
						rows="3"
						value={bbcode}
						onclick={(e) => (e.currentTarget as HTMLTextAreaElement).select()}
					></textarea>
					<div class="share-actions">
						<button type="button" class="btn primary" onclick={copyBbcode}>
							{copied ? 'copied!' : 'copy BBCode'}
						</button>
						<a class="share-short" href={shortUrl} target="_blank" rel="noopener">
							{shortUrl}
						</a>
					</div>
					{#if copyError}
						<p class="save-error">{copyError}</p>
					{/if}
				</div>
			</details>
		{/if}

		{#if liveComments.length > 0 || data.me}
			<details class="discl comments-discl">
				<summary>
					Comments
					{#if liveComments.length > 0}
						<span class="discl-count">{liveComments.length}</span>
					{/if}
				</summary>
				<div class="comments-body">
					{#if liveComments.length > 0}
						{#each liveComments as c (c.id)}
							<article class="comment">
								<header>
									<a href="/user/{c.path_alias || c.author}/photostream">
										{c.realname || c.authorname}
									</a>
									<time>{formatCommentDate(c.datecreate)}</time>
								</header>
								<p>{decodeAndStripHtml(c._content)}</p>
							</article>
						{/each}
					{:else}
						<p class="empty-comments">Be the first to comment.</p>
					{/if}

					{#if data.me}
						<form class="comment-form" onsubmit={submitComment}>
							<textarea
								bind:value={commentDraft}
								placeholder="Add a comment as {data.me.fullname || data.me.username}…"
								rows="3"
							></textarea>
							<div class="comment-actions">
								<button type="submit" class="btn primary" disabled={!commentDraft.trim() || posting}>
									{posting ? 'posting…' : 'post'}
								</button>
								{#if commentError}
									<span class="save-error">{commentError}</span>
								{/if}
							</div>
						</form>
					{/if}
				</div>
			</details>
		{/if}

		{#if tags.length > 0}
			<details class="tags-disclosure">
				<summary>
					Tags
					<span class="tags-count">{tags.length}</span>
				</summary>
				<ul class="tags">
					{#each tags as tag}
						<li>
							<a href="/search?tags={encodeURIComponent(tag.raw)}">{tag.raw}</a>
						</li>
					{/each}
				</ul>
			</details>
		{/if}

		<p class="links">
			<a href={backHref}>← back to {ownerName}'s photostream</a>
			{#if flickrPageUrl} · <a href={flickrPageUrl} target="_blank" rel="noopener">on flickr.com</a>{/if}
		</p>
		{#if streamCtx}
			<p class="hint">← / → or swipe to page · F for fullscreen · double-click or pinch to zoom · esc / swipe ↕ to close</p>
		{/if}
	</aside>
</article>

<style>
	article {
		max-width: 100rem;
		margin: 1.5rem auto;
		padding: 0 1.5rem;
		display: grid;
		grid-template-columns: minmax(0, 1fr) 22rem;
		gap: 2rem;
	}
	@media (max-width: 1024px) {
		article {
			grid-template-columns: 1fr;
		}
	}
	figure {
		margin: 0;
		background: var(--bg-elev);
		border-radius: 4px;
		overflow: hidden;
		position: relative;
	}
	.nav {
		position: absolute;
		top: 0;
		bottom: 0;
		width: 4rem;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 2.5rem;
		font-family: var(--font-sans);
		font-weight: 300;
		color: rgba(255, 255, 255, 0.55);
		background: linear-gradient(to right, rgba(0, 0, 0, 0.35), transparent);
		text-decoration: none;
		opacity: 0;
		transition: opacity 0.15s ease;
	}
	.nav.next {
		left: auto;
		right: 0;
		background: linear-gradient(to left, rgba(0, 0, 0, 0.35), transparent);
	}
	.nav.prev {
		left: 0;
	}
	figure:hover .nav {
		opacity: 1;
	}
	.nav:hover {
		color: #fff;
		text-decoration: none;
	}
	.counter {
		position: absolute;
		bottom: 0.75rem;
		right: 0.75rem;
		font-family: var(--font-mono);
		font-size: 0.75rem;
		color: rgba(255, 255, 255, 0.7);
		background: rgba(0, 0, 0, 0.55);
		padding: 0.2rem 0.55rem;
		border-radius: 2px;
	}
	.iconbtn {
		position: absolute;
		top: 0.6rem;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 2.1rem;
		height: 2.1rem;
		border-radius: 50%;
		background: rgba(0, 0, 0, 0.7);
		color: rgba(255, 255, 255, 0.95);
		font-size: 0.95rem;
		font-family: var(--font-sans);
		text-decoration: none;
		border: none;
		cursor: pointer;
		opacity: 1;
		transition: opacity 0.15s ease, background 0.15s ease;
	}
	.iconbtn.close {
		right: 0.6rem;
	}
	.iconbtn.full {
		right: 3.2rem;
	}
	.iconbtn.fave {
		right: 5.8rem;
		font-size: 1.1rem;
		line-height: 1;
	}
	.iconbtn.fave.active {
		color: var(--accent);
	}
	.iconbtn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
	.iconbtn:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}
	.iconbtn:hover {
		background: rgba(0, 0, 0, 0.85);
		color: #fff;
		text-decoration: none;
	}
	article.fullscreen {
		position: fixed;
		inset: 0;
		z-index: 200;
		max-width: none;
		margin: 0;
		padding: 0;
		grid-template-columns: 1fr;
		background: #000;
	}
	article.fullscreen aside {
		display: none;
	}
	article.fullscreen figure {
		width: 100%;
		height: 100%;
		margin: 0;
		border-radius: 0;
		display: flex;
		align-items: center;
		justify-content: center;
	}
	article.fullscreen figure img {
		max-height: 100vh;
		max-width: 100vw;
		width: auto;
		height: auto;
		object-fit: contain;
	}
	article.fullscreen .iconbtn {
		opacity: 0.4;
	}
	.hint {
		font-family: var(--font-mono);
		font-size: 0.7rem;
		color: var(--fg-muted);
		margin: 0.5rem 0 0;
	}
	figure img {
		display: block;
		width: 100%;
		height: auto;
		max-height: 85vh;
		object-fit: contain;
		background: #000;
		cursor: zoom-in;
	}
	article.fullscreen figure img {
		cursor: zoom-out;
	}
	aside {
		font-family: var(--font-sans);
	}
	.back-link {
		display: inline-block;
		background: var(--bg-elev);
		border: 1px solid var(--border);
		color: var(--fg);
		font-family: var(--font-mono);
		font-size: 0.78rem;
		padding: 0.4rem 0.85rem;
		border-radius: 3px;
		cursor: pointer;
		margin-bottom: 1rem;
	}
	.back-link:hover {
		border-color: var(--accent);
		color: var(--accent);
	}
	h1 {
		margin: 0 0 0.5rem;
		font-weight: 500;
		font-size: 1.5rem;
		letter-spacing: -0.01em;
		display: flex;
		align-items: center;
		gap: 0.4rem;
	}
	.edit-btn,
	.edit-btn-text {
		background: none;
		border: none;
		color: var(--fg-muted);
		cursor: pointer;
		font-size: 0.85rem;
		padding: 0.15rem 0.35rem;
		border-radius: 2px;
		transition: color 0.1s ease, background 0.1s ease;
	}
	.edit-btn:hover,
	.edit-btn-text:hover {
		color: var(--accent);
		background: var(--bg-elev);
	}
	.edit-btn.inline {
		font-size: 0.7rem;
		vertical-align: baseline;
		margin-left: 0.25rem;
	}
	.edit-btn-text {
		font-family: var(--font-mono);
		font-size: 0.85rem;
	}
	.edit-title,
	.edit-desc {
		width: 100%;
		background: var(--bg-elev);
		border: 1px solid var(--border);
		color: var(--fg);
		padding: 0.5rem 0.6rem;
		font-family: var(--font-sans);
		font-size: 1rem;
		border-radius: 3px;
		outline: none;
		box-sizing: border-box;
	}
	.edit-title {
		font-size: 1.5rem;
		font-weight: 500;
		letter-spacing: -0.01em;
	}
	.edit-desc {
		resize: vertical;
		min-height: 5rem;
		line-height: 1.45;
	}
	.edit-title:focus,
	.edit-desc:focus {
		border-color: var(--accent);
	}
	.edit-actions {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin: 0.5rem 0 1rem;
	}
	.btn {
		background: var(--bg-elev);
		border: 1px solid var(--border);
		color: var(--fg);
		padding: 0.4rem 0.9rem;
		font-family: var(--font-mono);
		font-size: 0.78rem;
		border-radius: 3px;
		cursor: pointer;
	}
	.btn.primary {
		background: var(--accent);
		color: #111;
		border-color: var(--accent);
	}
	.btn:hover:not(:disabled) {
		filter: brightness(1.1);
	}
	.btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
	.save-error {
		font-family: var(--font-mono);
		font-size: 0.75rem;
		color: #d96a6a;
	}
	.desc.empty {
		margin-top: 0.5rem;
	}
	.byline {
		color: var(--fg-muted);
		font-family: var(--font-mono);
		font-size: 0.8rem;
		margin: 0 0 1.5rem;
	}
	.desc {
		white-space: pre-wrap;
		color: #c8c8c8;
		font-size: 0.95rem;
		line-height: 1.55;
		margin: 0 0 1.5rem;
	}
	.desc :global(a) {
		color: var(--accent);
		word-break: break-word;
	}
	/* Shared disclosure pattern — used by Shot details, In albums, In groups,
	   Comments, and Tags so the right column reads as a stack of consistent
	   collapsible boxes. */
	.discl {
		margin: 1rem 0;
		padding-top: 0.75rem;
		border-top: 1px solid var(--border);
	}
	.discl summary {
		cursor: pointer;
		font-family: var(--font-mono);
		font-size: 0.7rem;
		font-weight: 500;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--fg-muted);
		list-style: none;
		display: flex;
		align-items: center;
		gap: 0.5rem;
		user-select: none;
		padding: 0.15rem 0;
	}
	.discl summary::-webkit-details-marker {
		display: none;
	}
	.discl summary::before {
		content: '▸';
		display: inline-block;
		transition: transform 0.15s;
		font-size: 0.7rem;
	}
	.discl[open] summary::before {
		transform: rotate(90deg);
	}
	.discl summary:hover {
		color: var(--accent);
	}
	.discl-count {
		font-family: var(--font-mono);
		font-size: 0.65rem;
		background: var(--bg-elev);
		border: 1px solid var(--border);
		padding: 0.05rem 0.35rem;
		border-radius: 8px;
		color: var(--fg);
	}
	.discl-tag {
		font-family: var(--font-mono);
		font-size: 0.65rem;
		color: var(--fg-muted);
		text-transform: none;
		letter-spacing: 0;
		font-weight: normal;
		margin-left: auto;
	}
	.shot-dl {
		display: grid;
		grid-template-columns: max-content 1fr;
		gap: 0.35rem 1rem;
		margin: 0.75rem 0 0;
	}
	.shot-dl dt {
		font-family: var(--font-mono);
		font-size: 0.75rem;
		color: var(--fg-muted);
	}
	.shot-dl dd {
		margin: 0;
		font-family: var(--font-mono);
		font-size: 0.8rem;
		color: #c8c8c8;
	}
	.comments-body {
		margin-top: 0.75rem;
	}
	.share-body {
		margin-top: 0.75rem;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	.share-label {
		font-family: var(--font-mono);
		font-size: 0.7rem;
		color: var(--fg-muted);
		text-transform: uppercase;
		letter-spacing: 0.06em;
	}
	.share-size {
		font-family: var(--font-mono);
		font-size: 0.8rem;
		padding: 0.35rem 0.5rem;
		background: var(--bg-elev);
		color: var(--fg);
		border: 1px solid var(--border);
		border-radius: 4px;
	}
	.share-bbcode {
		font-family: var(--font-mono);
		font-size: 0.75rem;
		padding: 0.5rem;
		background: var(--bg-elev);
		color: var(--fg);
		border: 1px solid var(--border);
		border-radius: 4px;
		resize: vertical;
		word-break: break-all;
	}
	.share-actions {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		flex-wrap: wrap;
	}
	.share-short {
		font-family: var(--font-mono);
		font-size: 0.75rem;
		color: var(--fg-muted);
	}
	.share-short:hover {
		color: var(--accent);
	}
	/* Backwards-compat: legacy class names that still appear elsewhere on the
	   page (e.g. tags-disclosure, tags-count) inherit the new .discl tokens. */
	.tags-disclosure {
		margin: 1rem 0;
		padding-top: 0.75rem;
		border-top: 1px solid var(--border);
	}
	.tags-disclosure summary {
		cursor: pointer;
		font-family: var(--font-mono);
		font-size: 0.7rem;
		font-weight: 500;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--fg-muted);
		list-style: none;
		display: flex;
		align-items: center;
		gap: 0.5rem;
		user-select: none;
		padding: 0.15rem 0;
	}
	.tags-disclosure summary::-webkit-details-marker {
		display: none;
	}
	.tags-disclosure summary::before {
		content: '▸';
		display: inline-block;
		transition: transform 0.15s;
		font-size: 0.7rem;
	}
	.tags-disclosure[open] summary::before {
		transform: rotate(90deg);
	}
	.tags-disclosure summary:hover {
		color: var(--accent);
	}
	.tags-count {
		font-family: var(--font-mono);
		font-size: 0.65rem;
		background: var(--bg-elev);
		border: 1px solid var(--border);
		padding: 0.05rem 0.35rem;
		border-radius: 8px;
		color: var(--fg);
	}
	.tags {
		list-style: none;
		padding: 0;
		margin: 0.75rem 0 0;
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
	}
	.tags li {
		font-family: var(--font-mono);
		font-size: 0.75rem;
		background: var(--bg-elev);
		border: 1px solid var(--border);
		border-radius: 2px;
		transition: border-color 0.12s;
	}
	.tags li:hover {
		border-color: var(--accent);
	}
	.tags li a {
		display: block;
		padding: 0.15rem 0.5rem;
		color: var(--fg-muted);
		text-decoration: none;
	}
	.tags li:hover a {
		color: var(--accent);
	}
	.loc {
		font-family: var(--font-mono);
		font-size: 0.8rem;
		color: var(--fg-muted);
		margin: 0 0 1.5rem;
	}
	.context-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}
	.context-list li {
		font-size: 0.85rem;
	}
	.context-list .ctx-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
	}
	.context-list a {
		color: #d8d8d8;
		text-decoration: none;
		border-bottom: 1px solid transparent;
	}
	.context-list a:hover {
		border-bottom-color: var(--accent, #ffae00);
	}
	.ctx-remove {
		appearance: none;
		border: 0;
		background: transparent;
		color: var(--fg-muted, #888);
		font-family: var(--font-mono);
		font-size: 0.9rem;
		line-height: 1;
		padding: 0 0.35rem;
		cursor: pointer;
		opacity: 0.5;
		transition: opacity 120ms ease, color 120ms ease;
	}
	.context-list .ctx-row:hover .ctx-remove,
	.ctx-remove:focus-visible {
		opacity: 1;
	}
	.ctx-remove:hover {
		color: var(--accent, #ffae00);
	}
	.ctx-remove:disabled {
		opacity: 0.4;
		cursor: progress;
	}
	.ctx-count {
		font-family: var(--font-mono);
		font-size: 0.7rem;
		color: var(--fg-muted);
		margin-left: 0.4rem;
	}
	.add-group-body {
		margin-top: 0.75rem;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	.group-search {
		width: 100%;
		background: var(--bg-elev);
		border: 1px solid var(--border);
		color: var(--fg);
		padding: 0.45rem 0.6rem;
		font-family: var(--font-sans);
		font-size: 0.85rem;
		border-radius: 3px;
		outline: none;
		box-sizing: border-box;
	}
	.group-search:focus {
		border-color: var(--accent);
	}
	.group-list {
		list-style: none;
		padding: 0;
		margin: 0;
		max-height: 16rem;
		overflow-y: auto;
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
	}
	.group-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		width: 100%;
		background: var(--bg-elev);
		border: 1px solid var(--border);
		color: var(--fg);
		padding: 0.4rem 0.6rem;
		font-family: var(--font-sans);
		font-size: 0.85rem;
		border-radius: 3px;
		cursor: pointer;
		text-align: left;
	}
	.group-row:hover:not(:disabled) {
		border-color: var(--accent);
		color: var(--accent);
	}
	.group-row:disabled {
		opacity: 0.55;
		cursor: not-allowed;
	}
	.group-row.is-added,
	.group-row.is-pending {
		opacity: 1;
	}
	.group-row.is-added .group-name,
	.group-row.is-pending .group-name {
		color: var(--fg-muted);
	}
	.group-row.is-added .group-add-hint {
		color: var(--accent);
	}
	.group-row.is-pending .group-add-hint {
		color: #d4b045;
	}
	.group-name {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.group-add-hint {
		font-family: var(--font-mono);
		font-size: 0.7rem;
		color: var(--fg-muted);
		flex-shrink: 0;
	}
	.group-row:hover:not(:disabled) .group-add-hint {
		color: var(--accent);
	}
	.comment {
		/* Override the generic `article { display: grid }` rule from the page
		   layout — `<article class="comment">` is a flow-content block, not a
		   2-column grid. */
		display: block;
		padding: 0.6rem 0;
		border-bottom: 1px solid var(--border);
	}
	.comment:last-child {
		border-bottom: none;
	}
	.comment header {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		gap: 0.5rem;
		margin-bottom: 0.3rem;
		font-family: var(--font-mono);
		font-size: 0.75rem;
	}
	.comment header a {
		color: var(--fg);
	}
	.comment header time {
		color: var(--fg-muted);
		font-size: 0.7rem;
	}
	.comment p {
		margin: 0;
		font-size: 0.85rem;
		line-height: 1.45;
		color: #c8c8c8;
		white-space: pre-wrap;
	}
	.empty-comments {
		font-family: var(--font-mono);
		font-size: 0.78rem;
		color: var(--fg-muted);
		margin: 0 0 0.75rem;
	}
	.comment-form {
		margin-top: 0.75rem;
	}
	.comment-form textarea {
		width: 100%;
		background: var(--bg-elev);
		border: 1px solid var(--border);
		color: var(--fg);
		padding: 0.55rem 0.65rem;
		font-family: var(--font-sans);
		font-size: 0.9rem;
		line-height: 1.45;
		border-radius: 3px;
		outline: none;
		resize: vertical;
		min-height: 4rem;
		box-sizing: border-box;
	}
	.comment-form textarea:focus {
		border-color: var(--accent);
	}
	.comment-actions {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-top: 0.5rem;
	}
	.links {
		font-family: var(--font-mono);
		font-size: 0.8rem;
		margin: 2rem 0 0;
		padding-top: 1rem;
		border-top: 1px solid var(--border);
	}
</style>
