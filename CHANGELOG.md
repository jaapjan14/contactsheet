# Changelog

## [Unreleased]

### Added

- **"Add to group" typeahead on the lightbox** — for owned photos, a new
  disclosure under "In groups" lists Jacob's group memberships with a name
  filter (type "leica" → all his Leica groups). Clicking a row calls a new
  `POST /api/photo/[id]/groups` endpoint (`flickr.groups.pools.add`) and
  optimistically appends the group to the live "In groups" list. The query
  persists across clicks so a single "leica" filter can drive a batch add
  across every Leica group; each row shows status inline — `+ add`,
  `adding…`, `✓ added`, or `⏳ pending` (moderator approval, Flickr error
  code 7). Already-in-pool errors (code 3) fold into success. Server load
  fetches `flickr.people.getGroups` in parallel with the rest of the photo
  data when the user is signed in (cached 5 min via the existing
  `getUserGroups` helper). New `addPhotoToGroup` helper invalidates
  `photos.getAllContexts` for the photo and the group's pool listing on
  success.

### Fixed

- **Notifications no longer under-count fave activity.** `flickr.activity.userPhotos`
  truncates the per-photo `event` array to a handful of entries — a photo that
  picks up 98 faves in a day was surfacing as ~2 fave notifications. The poller
  now treats activity as a "which photos have action" hint and, for any photo
  with fave events in the response, calls `flickr.photos.getFavorites` to pull
  the full faver list (capped at 100 per photo, scoped to a 30-day look-back).
  Existing INSERT-OR-IGNORE dedup on `fave:<photoId>:<nsid>:<favedate>` keeps
  the backfill idempotent. New `getPhotoFavorites()` helper in
  `src/lib/server/flickr/photos.ts`. Group-approval ("admin approved your
  photo for X") notifications are still missing — separate followup since
  there's no first-class Flickr endpoint for that stream.
- **"Add to group" list is no longer capped at 8 entries** — the unqueried
  candidate list was sliced to 8, which made the dropdown feel "locked"
  since the `.group-list` scroll container had nothing past the visible
  rows to scroll to. Removed the cap (and the matching 20-item cap on the
  search path); the existing `max-height: 16rem; overflow-y: auto` on the
  list container handles the visual constraint.
- **Safari deep-grid back-nav gray-screen fixed via Darkroom-style modal
  pattern.** Clicking a grid cell no longer routes to `/photo/[id]` — instead
  `openPhoto()` (`src/lib/photo-overlay.ts`) calls `preloadData()` for the
  same data the route would load server-side, then `pushState`s an entry
  with `$page.state.photoOverlay = { data }`. The layout renders
  `<PhotoOverlay>` (`src/lib/components/PhotoOverlay.svelte`) which wraps a
  newly-extracted `<PhotoView>` component (`src/lib/components/PhotoView.svelte`,
  ~1,500 lines moved verbatim from the old `+page.svelte`). Closing is just
  `history.back()` — pops the pushState entry, the grid was never unmounted,
  no scroll restoration runs. WebKit's deep-page back-nav snapshot bug
  (gray screen, then click lands at the top of the page in some other
  photo) is now structurally impossible: there's no navigation to mis-handle.
  Direct visits to `/photo/[id]` (bookmarks, share links, hard reloads)
  still render the standalone route page — the route file is now a thin
  wrapper around `<PhotoView>`. Hooks added to PhotoView: `onclose` and
  `onpaginate` props let the overlay swap data + URL in place when the
  user clicks prev/next; route mode keeps the original `goto()` behavior.
  Cell click handler `onCellClick(e, id)` preserves cmd/ctrl/middle/shift-
  click for "open in new tab." Wired into 12 grid pages: explore, feed,
  search, group, gallery, album, photostream, faves, camera-roll, stats,
  about, notifications.
- **View counts on `/photo/[id]` no longer go stale for up to a week.**
  `flickr.photos.getInfo` was being cached for 7 days, but the `views` field
  on the response is a live counter — a popular photo would freeze at the
  first cached value (e.g. 254 views in-app vs 3,361 on Flickr). Dropped
  `TTL_INFO` to 1 hour and bumped the cache key to `photos.getInfo.v2` so
  any entries written under the old long TTL are orphaned and get purged on
  schedule instead of serving stale counts.

### Changed

- **`/search` is now self-explanatory.** Added a page title and a short
  blurb at the top making clear that this is the global Flickr search and
  returns both photos and groups, plus a help line under the form
  spelling out that `By user` and `Tags` only narrow the *photo* results
  (groups always come from the text box). Field placeholders rewritten in
  the same vein (`Text — title, description, tags…` / `By user (URL or
  screen-name)` / `Tags only (comma-separated)`). The result-count meta
  now also reports group matches alongside photo totals. Setup for the
  next change: scoped in-page search inside `/group/[id]`, etc.

### Added

- **`/feed` — recent uploads from contacts.** New top-level page wired to
  `flickr.photos.getContactsPhotos` (auth-only; max 50 most-recent
  uploads from people you follow on Flickr — Flickr's endpoint doesn't
  paginate). Hover overlay shows uploader name + relative upload time.
  Anonymous viewers see a sign-in nudge instead. Linked from the header
  ⋯ menu when signed in. Backed by a new `src/lib/server/flickr/contacts.ts`
  module (`getMyContacts`, `getMyContactNsidSet`, `getContactsPhotos`,
  cached 5 min and 1 min respectively).
- **Follow indicator on `/user/[id]/...` pages.** UserChrome now lazy-loads
  `/api/contacts/state?nsid=…` on mount; if the viewer follows the
  displayed user, shows a green "✓ Following" badge that links out to
  flickr.com to manage. Otherwise shows "+ Follow on Flickr" which opens
  the user's flickr.com page in a new tab. Honest about the API
  constraint: Flickr does not expose `contacts.add`, so a real in-app
  follow button isn't possible — the bounce keeps Flickr's contact list
  as the single source of truth, which `flickr.photos.getContactsPhotos`
  reads back to populate `/feed`.
- **Join / Leave button on `/group/[id]`.** Real in-app
  `flickr.groups.join` / `flickr.groups.leave` calls — no flickr.com
  bounce needed. Membership state lazy-loaded via a new
  `/api/group/[id]/membership` endpoint (GET = read state, POST = join,
  DELETE = leave). Optimistic flip on click with rollback on failure.
  Cache invalidates `people.getGroups` for the authed user so the
  `/user/[id]/groups` tab reflects the change on next load.

### Fixed

- **`close()` on the photo page now always prefers `history.back()`** when
  there's any history to pop, regardless of whether `streamCtx` is in
  sync. Earlier logic gated `history.back` on `streamCtx &&
  history.length > 1`, so a stale or rejected `streamCtx` would silently
  fall through to `goto(backHref)`, which is a fresh navigation and
  scrolls to top. That explained the "bounces all the way to top of the
  page" symptom on back-from-photo. `goto` is now only the fallback for
  the literal direct-deep-link case (no history to pop).

### Reverted

- **`afterNavigate` scroll re-application backed out.** The
  expand-then-scroll fix landed two iterations ago was making the
  back-from-photo experience *worse*: users were getting teleported to
  unrelated positions on every back. Trading a worse symptom (wrong
  destination on every back) for a milder one (clamped near top of a
  deeply-scrolled grid). All five grid pages reverted to the original
  snapshot pattern that just re-initializes from `snapHolder` in the
  script body.
  Real fix is to adopt Darkroom Log's pattern: keep the grid mounted
  and render the photo viewer as a modal overlay over it, so the grid
  never unmounts and there's nothing to scroll-restore. See
  `darkroom-log-reference.md`:390 — "All tabs preserve scroll position
  while a photo detail is open — the grid stays mounted underneath."
  Tracked separately.

### Removed

- **View transitions disabled.** The cell-to-photo morph was triggering
  expensive snapshot work on every navigation (every grid cell carried a
  unique `view-transition-name`), and a back-tap during the still-running
  forward transition left the browser's `::view-transition` overlay
  stuck on screen — visible as a dark page that needed a tap to
  dismiss, with the tap then landing on whatever cell was at that
  pixel coordinate. Symptom got dramatically worse once `/feed` and the
  paginated `/search` started loading hundreds of cells via infinite
  scroll. Removed `onNavigate(... startViewTransition)` from the layout
  and stripped `view-transition-name` from grid cells (`/feed`,
  `/search`, `/explore`, `/group/[id]`, `/user/[id]/photostream`) and
  the photo page. The morph is gone but navigation is reliable.
  Re-introducing the morph cleanly would require setting the name only
  on the clicked cell at click time so the browser snapshots one
  element instead of N.

### Fixed

- **Back-from-photo into a deeply-scrolled grid no longer lands near the
  top.** Root cause was a snapshot/scroll-restore race that had been
  latent across `/search`, `/explore`, `/group/[id]`,
  `/user/[id]/photostream`, and the new `/feed`: SvelteKit's
  `snapshot.restore()` runs *after* the new component mounts AND after
  the built-in scroll restoration (verified against
  `kit/runtime/client/client.js`:1879 vs :1917). So on back-nav, the
  grid initialized with the small server-load page (~100 photos), the
  browser tried to restore scroll to the deep saved Y, the page was too
  short, and scroll clamped to a near-top position. The user landed on
  a random near-top photo and saw a "gray page" of unpainted background
  past the end of the short grid.
  Fix: every snapshot now also captures `scrollY`. After every navigation
  the page's `afterNavigate` callback expands local state to the buffered
  depth and re-applies scroll on the next animation frame, so by the
  time the browser has finished its work, the grid is tall enough and
  scroll lands where the user left it. URL/key match is checked so back
  to `/search?q=foo` from `/search?q=bar` doesn't smear state.
  Also reverted yesterday's `content-visibility: auto` /
  `contain-intrinsic-size: 220px 220px` change — it was making the
  problem worse because the intrinsic size (220×220) was 12% smaller
  than the actual cell size on a wide viewport, so the page reported
  itself as shorter than reality and scroll restoration clamped even
  with the full data loaded.
- **Back-from-photo could land on the wrong page.** The photo route was
  reading `streamCtx` from `sessionStorage` on mount and using whatever
  was last stashed by any grid page in the tab. If you opened a photo
  from `/feed`, then navigated to a user's photostream from inside that
  photo, then hit back, then opened another photo and hit back again,
  the leftover photostream context would silently steer "close" to that
  photostream instead of `/feed`. Now we only honor a stashed
  `streamCtx` whose `ids` actually contains the current photo — stale
  contexts are ignored and back falls through to the photo owner's
  photostream (which at least matches the photo on screen).

### Performance

- **`content-visibility: auto` on `.cell` across all grid pages**
  (`/feed`, `/search`, `/group/[id]`, `/explore`, `/user/[id]/photostream`).
  Lets the browser skip painting cells outside the viewport, with
  `contain-intrinsic-size: 220px 220px` so layout still resolves
  correctly. Targets the gray-screen flash when navigating back from a
  photo into a deeply-scrolled grid.

### Changed

- **`/feed` swapped from `getContactsPhotos` to `photos.search&contacts=all`.**
  The original `flickr.photos.getContactsPhotos` endpoint hard-caps at 50
  photos with no pagination. Side-by-side comparison against the live
  account showed the first ~4 photos identical, then the two endpoints
  diverge (`getContactsPhotos` quietly diversifies away from prolific
  uploaders, `photos.search` is pure chronological). Swapping unlocks
  proper pagination — same infinite-scroll pattern as `/search` and
  `/group/[id]`, dup-guard for Flickr's mostly-stable
  `date-posted-desc` sort, scrollable up to Flickr's ~4,000-result cap.
  Total available count appears in the blurb. The single uploader
  binge-domination trade-off was deemed acceptable for the much larger
  feed. `searchPhotos()` now accepts an optional `contacts: 'all' | 'ff'`
  param. New `/api/feed?page=N` endpoint serves load-more pages. Dead
  `getContactsPhotos()` removed from `src/lib/server/flickr/contacts.ts`.
- **Header nav promoted on desktop.** `Explore` and `Feed` (signed-in
  only) are now first-class header links between the brand and the
  search box, with the active route underlined in accent. The ⋯ menu
  was burying them and they were genuinely hard to find. On mobile
  (≤640px) the topnav stays hidden and the same destinations live
  inside ⋯ — keeps the single-row mobile header from getting crowded.
- **`/search` blurb max-width bumped 60ch → 100ch** so it sits on two
  lines on a desktop viewport instead of wrapping to four.

### Added

- **In-group search on `/group/[id]`.** New search box in the group
  header — submits to `/group/[id]?q=…`, swaps the grid from
  `groups.pools.getPhotos` to `flickr.photos.search` scoped via
  `group_id`. Supports the same infinite-scroll loadMore behavior as the
  full pool view; `?q=…` is forwarded to `/api/group/[id]/photos` so
  paged fetches stay in search mode. A "show all" link clears back to
  the full pool. `searchPhotos()` in `src/lib/server/flickr/search.ts`
  now accepts an optional `groupId`. Establishes the
  scoped-search-on-context-page pattern that will extend to album / user
  pages next.
- **BBCode share on the photo page.** New "Share / BBCode" disclosure in
  the right column with a size selector (every photo-media size Flickr
  offers, defaulting to the largest non-Original ≤ 1600 px), a generated
  `[url=https://flic.kr/p/SHORT][img]LIVE_STATIC_URL[/img][/url]`, a
  copy-to-clipboard button, and the short URL itself as a clickable link
  beside it. Mirrors the affordance Flickr exposes on its own photo page.
  Short URL uses Flickr's base58 alphabet (skips `0`, `O`, `l`, `I`); the
  helper lives in `src/lib/flickr/urls.ts` as `flickrShortUrl()`.
  `+page.server.ts` now also returns `photoSizes` (filtered to
  `media === 'photo'`) for the picker.

### Docs

- **README rewrite** — added a full Flickr API credentials walkthrough
  (apply page → keys → `.env`), an Architecture Notes section covering the
  SQLite cache layer, notifications poller, OAuth signer and CSP/auth
  gate, and an expanded Roadmap split into "Planned" (committed work) and
  "Considered" (under-discussion ideas: multi-user, public sharable
  lightbox links, local-image cache, bulk-edit, soft-delete inbox,
  comparison view, smart albums, Slack/Pushover relay).
- **Scrubbed deployment specifics** from `README.md` and
  `docker-compose.qnap.yml` — the SSH user/host/port and NAS-internal path
  are now `<user>@<nas-host>` / `/path/to/contactsheet/` placeholders so
  the public repo doesn't advertise one specific homelab's layout.

### Cleanup

- **`/notifications` typecheck warnings cleared** — `item.payload` had been
  flowing through the page as `unknown`, breaking the inferred parameter
  type for `thumbUrl()` and the `dateadded` access. Routed both through the
  already-aliased `{@const p}` cast inside the `{#each}`. Initial
  `let items = $state(...)` now wraps the source read in `untrack` so
  svelte-check stops asking whether it should be a derived (it shouldn't —
  the page mutates `items` independently after first render).
- **Removed unused CSS selectors** in `src/routes/photo/[id]/+page.svelte`
  — `.shot`, `.comments`, `.contexts`, and their descendant rules were
  leftover from before the disclosure-row refactor. Net result: zero
  errors, zero warnings on `npx svelte-check`.

### Added

- **Notification rows link to the user's photostream.** In the bell dropdown
  and on `/notifications`, the username on a "X faved your photo" /
  "X commented" item is now an accent-coloured link to `/user/{nsid}/photostream`,
  so you can jump straight to the person's feed. The photo title remains the
  primary click target into `/photo/{id}`. Restructured the row from one
  outer `<a>` to a flex container with a thumb-anchor + inline content
  anchors so the two destinations can coexist without nested `<a>` tags.
- **Search now also returns Flickr groups.** The `/search` page calls
  `flickr.groups.search` in parallel with the photo search whenever the query
  has free text, and renders matching groups in a collapsible strip above the
  photo grid. Each card shows the group's buddy icon, name, member count, and
  pool size, and links into the existing in-app `/group/{nsid}` view rather
  than out to flickr.com. New endpoint at `/api/search/groups`. Groups results
  are cached 10 min server-side. `searchGroups()` lives in
  `src/lib/server/flickr/groups.ts`; types in `src/lib/server/flickr/types.ts`.

### Fixed

- **Closing fullscreen now lands on the photo info page, not the grid.** ✕,
  swipe-↕, and wheel-up-to-close used to skip past the un-fullscreen state
  and bounce all the way to the grid in a single action. They now follow
  the same cascade Esc has always used: zoom → exit fullscreen → close to
  grid. A second dismiss from the info page still goes to the grid. The
  sidebar "← Back to {context}" link is unchanged (always grid).
- **Photo description renders HTML instead of escaping it.** Flickr ships
  descriptions as HTML (mostly `<a>`/`<br>` plus entity-encoded chars), but
  the photo page was rendering them as literal text, so links to the
  photographer's Instagram etc. came through as visible
  `<a href="...">Instagram</a>` source. Same `decodeFlickrEntities` →
  `sanitizeFlickrHtml` → `{@html}` pipeline already used on the user About
  page, plus matching accent-coloured link styling.
- **Safari now actually shows the high-res image when zoomed.** The zoom
  controller used to set `will-change: transform` permanently on the
  `<img>`; this is fine on Firefox but on Safari it pins the element to a
  composited layer rasterized at element layout size (2048 px), so even
  with the Original src, transform-scaling just GPU-upscaled the same
  2048-pixel bitmap → no sharpness gain. `will-change` is now applied only
  during an active gesture and cleared after a 220 ms settle, so static
  zoom states re-rasterize from the high-res source — Safari behaviour now
  matches Firefox.
- **HTML responses no longer cache at the edge.** Cloudflare was holding
  page HTML for ~2 hr by default, which meant a fresh container could
  still serve the old hashed JS bundle URL and "I just deployed" never
  actually reached the browser. `hooks.server.ts` now sets `Cache-Control:
  no-store, must-revalidate` for everything except `/_app/immutable/**`
  (which is content-addressable and safe to cache aggressively).
- **Right-column disclosures default to closed on a fresh photo.** "Shot
  details" and "Comments" used to spring open on load, pushing the rest of
  the column down. Both now default to collapsed; user expands what they
  want.
- **High-res image swap on zoom now actually sticks**, with a two-tier
  progressive enhancement so we match Flickr's own viewer pixel-for-pixel:
  - Root cause was reactive: the lightbox `<img>` binds `src={display.source}`,
    so the previous imperative `target.src = highResUrl` was being clobbered
    back to the 2048 display URL on the very next reactive tick. Replaced
    with a reactive `imgSrc` derived gated on a stage state machine.
  - Stage 1 — `highRes`: X-Large 6K (~1–3 MB) preloads on enter-fullscreen
    and swaps in within ~1 sec.
  - Stage 2 — `maxRes`: Original (often 15–40 MB) preloads in the background
    once stage 1 completes, then swaps in. This unblocks the initial
    sharpness boost behind the long Original download but still ends up at
    full pixel parity with flickr.com when zooming side-by-side.
  - Added `onerror` logging for both stages so future preload failures
    aren't silent.
- **Hydration restored** (regression from earlier in this changelog). The
  CSP I added in `hooks.server.ts` was overwriting the nonce-bearing CSP
  that SvelteKit auto-generates from `kit.csp.directives`, which silently
  blocked the inline hydration script. Result: pages rendered server-side
  but client-side JS never ran — manifesting as "infinite scroll stopped"
  / "no interactivity". Reverted to relying on svelte.config.js's CSP and
  kept only the `Content-Security-Policy-Report-Only` clobber for the
  Cloudflare edge-injected report-only noise.

- **Zoom controller hardening** (`src/lib/zoom.ts`): added `ResizeObserver` on
  the parent so resizing the window / rotating the device while zoomed re-clamps
  the image (without it, the image could slide off-screen and stay there).
  Normalized `WheelEvent.deltaMode` so Firefox line-mode and old page-mode
  configs zoom/pan at the same speed as pixel-mode. Reset transform before
  paging so View Transitions snapshots aren't taken mid-zoom.
- **iOS double-tap zoom**: iOS Safari doesn't fire `dblclick` when pointer
  capture is active on the target, so manual time + distance double-tap
  detection in `pointerdown` for `pointerType === 'touch'`. Mouse keeps using
  the native `dblclick` event.
- **Pinch on iPhone no longer triggers swipe-close.** When two fingers from a
  pinch lift in different order, `changedTouches[0]` could measure (finger #2's
  end − finger #1's start), producing a large pseudo-swipe that fired the
  close-on-vertical-swipe handler. The lightbox now flags any multi-touch
  during a stroke and bails on the swipe interpretation.

### Added

- **Pinch / wheel / drag zoom in fullscreen** (`src/lib/zoom.ts`,
  `src/routes/photo/[id]/+page.svelte`): a framework-agnostic zoom controller
  attaches to the lightbox image when fullscreen is active. ctrl+wheel
  (and macOS trackpad pinch) zooms toward the cursor; two-finger pinch zooms
  toward the gesture midpoint; one-finger drag pans when zoomed; double-click
  toggles 1× ↔ 2.5× anchored at the cursor. Esc reset → exit fullscreen →
  close, in that order. Swipe-paging and click-to-exit-fullscreen are
  suppressed while zoomed so a pan can't be reinterpreted as paging. The
  controller (`makeZoomer(imgEl)`) has no SvelteKit dependencies and is
  designed to drop straight into Darkroom Log's fullscreen view.
- Initial scaffold: SvelteKit 2 + Svelte 5 (TypeScript), Node adapter, Prettier
- Flickr API client with hand-rolled OAuth 1.0a HMAC-SHA1 signer
  (`src/lib/server/flickr/oauth.ts`, `src/lib/server/flickr/client.ts`)
- `/health` route — round-trips `flickr.test.echo` to verify the API key
- Dark theme shell with IBM Plex Mono / Sans, orange accent (matches Darkroom Log family)
- `.env.example` and `.gitignore` covering `.env`
- Per-user view scaffold: `/user/[id]/photostream` resolves a Flickr screen name,
  path-alias, or NSID to a stable ID via `flickr.urls.lookupUser` (with
  `findByUsername` fallback) and renders a dark, square-thumb grid of the user's
  100 most recent photos, plus a tab bar mirroring Flickr's profile nav
  (only Photostream wired; others stubbed)
- Single-photo lightbox at `/photo/[id]` — picks the largest size ≤ 2048px from
  `flickr.photos.getSizes`, renders title / byline / description / tags / location
  alongside the image, with a back-link to the owner's photostream
- Home page is a username input that routes to `/user/[input]/photostream`
- View Transitions API hook in `+layout.svelte` for smooth cross-fades on navigation
- Helpers: `src/lib/server/flickr/{users,urls,types}.ts`
- Named view-transitions: `view-transition-name: photo-{id}` on grid thumbnails AND
  on the lightbox image — clicked thumbnail morphs into the full image, and back.
  This is the moment ContactSheet stops feeling like "another Flickr viewer."
- Lightbox arrow-key paging: photostream stashes its photo IDs in sessionStorage on
  mount; lightbox reads the context to expose prev/next, binds ←/→/Esc, and uses
  SvelteKit `preloadData` to warm the neighbor pages so paging feels instant.
- Lightbox: hover-revealed prev/next overlay buttons + position counter (`12 / 100`)
- Infinite-scroll pagination on photostream — IntersectionObserver on a sentinel
  element fetches the next page from `/api/user/[id]/photos?page=N` (JSON
  endpoint) and appends to the grid. Loaded photo IDs are continuously written to
  sessionStorage so lightbox arrow-paging extends across every loaded page.
  "End of stream" marker once all pages are loaded.
- Extracted `getUserPhotos()` helper (`src/lib/server/flickr/people.ts`)
  shared by the page server-load and the JSON endpoint
- Albums tab live: `/user/[id]/albums` lists all photosets in a 4:3-cover card grid
  (title + photo count below cover). Clicking a card opens `/album/[id]` —
  same paginated grid pattern as the photostream, with `flickr.photosets.getPhotos`
  + `/api/album/[id]/photos?page=N` infinite-scroll endpoint.
- Album header on detail page: title, photo count, "all albums" back-link.
- Lightbox stream context now also handles album-scoped streams (
  `{ ids, albumId, tab: 'album' }`) — arrow-paging within an album works,
  Esc/back-link returns to the album rather than the user's photostream.
- `getUserAlbums()` + `getAlbumPhotos()` helpers in `src/lib/server/flickr/photosets.ts`.
- Refactor: extracted shared `<UserChrome>` component (avatar, name, location,
  tab nav) used by Photostream, Albums, and Album-detail pages. Tab list lives
  in one place — flipping a tab from `disabled: true` to enabled is now a
  single-line change.
- Moved `urls.ts` from `$lib/server/flickr/` to `$lib/flickr/` so the pure
  URL-building helpers can be imported into client components without crossing
  SvelteKit's server-boundary convention.
- Suppressed Svelte 5 `state_referenced_locally` warnings via `untrack(() => …)`
  on initial $state derivations from props — intentional pattern (mutable local
  copy + reset-on-navigation via `$effect`).
- OAuth 1.0a sign-in flow (`/auth/start` → Flickr authorize → `/auth/callback`):
  - Reuses the existing HMAC-SHA1 signer in `src/lib/server/flickr/oauth.ts`
  - Token store is a JSON file at `data/auth.json` (gitignored), atomically
    written via tmp-file + rename
  - Request-token secrets cached in-process for 10 min during the dance
  - `flickrAuth()` helper auto-attaches the stored access token to signed calls,
    redirecting to `/auth/start` if no auth is present
  - Layout shows "sign in to Flickr" or "{name} · log out" depending on state
  - `data.me` surfaced via `+layout.server.ts` for the whole app to read
- `.gitignore`: added `/data` so the auth.json (and any future on-disk caches)
  are never committed
- Requested permission level: `write` — covers all current read flows and any
  future tagging / setTags / upload work without re-authing
- Lightbox: explicit close button (X, top-right) plus a fullscreen toggle (⤡, F key).
  Esc is tiered — exits fullscreen first if active, otherwise closes back to the
  grid. Default opacity 55%, brightens on figure hover or keyboard focus, so the
  affordances are visible without dominating the photo.
- Lightbox swipe paging:
  - Two-finger trackpad horizontal swipe (wheel `deltaX`) navigates prev/next
  - Touch swipe (touchstart/touchend on the figure) does the same on mobile
  - 350ms cooldown after each navigation prevents wheel bursts from skipping
    multiple photos
  - Vertical motion (real scroll) is preserved — only horizontal gestures page
- Hint text below the image updated: "← / → or two-finger swipe to page · F
  fullscreen · esc to close"
- Lightbox click-to-zoom: clicking the image (anywhere except nav arrows / icon
  buttons) toggles fullscreen. Cursor switches between zoom-in and zoom-out so
  the affordance is obvious before clicking.
- Vertical swipe (touch, either direction) closes the lightbox.
- **Scroll position is preserved on close.** Arrow / swipe paging now uses
  `goto({ replaceState: true, noScroll: true })` so the grid stays exactly one
  history step behind no matter how many photos you flip through; close uses
  `history.back()` (with a goto fallback for deep-links), and SvelteKit's native
  scroll restoration drops you back at the exact thumbnail you started from.
  This is the bug that bothers Jacob most about the official Flickr site —
  ContactSheet specifically fixes it.
- Lightbox sidebar now includes:
  - **Shot details** block — Camera, Lens, Focal length, Aperture, Shutter,
    ISO (any subset that's present in the EXIF). Built from
    `flickr.photos.getExif`, parallel-fetched with the existing photo info call.
  - **Comments** block — author name (linked to their photostream), date,
    body. HTML stripped for safety, common entities decoded. Built from
    `flickr.photos.comments.getList`.
  - Both calls are best-effort (catch → null) so a missing-EXIF or
    private-comments photo doesn't break the page.
- Group support: `/group/[id]` route renders a group header (icon + name +
  member count + pool size) and the same paginated infinite-scroll grid as
  user/album pages, backed by `flickr.groups.pools.getPhotos` and a
  `/api/group/[id]/photos?page=N` endpoint. `resolveGroupId()` handles NSIDs
  directly and falls back to `flickr.urls.lookupGroup` for path-aliases.
- Home form is now URL-aware: paste a Flickr URL — user, group, or single photo —
  and it routes to the right place. Bare slugs default to user.
- Lightbox stream context now also handles group-scoped streams so arrow-paging
  through a group pool returns to the group on close (not the photo's owner's
  photostream).
- OAuth callback round-trip confirmed working: Jacob's `data/auth.json` written
  with NSID `35143787@N04` (username `lakatua`).
- Inline edit for title and description on the lightbox, owner-gated:
  - Pencil icon next to title (and inline after description) only renders when
    `data.me.nsid === photo.owner.nsid`. Verified hidden on non-owned photos.
  - Click pencil → field becomes a text input (or 6-row textarea for description).
    Save / Cancel buttons; saving state disables the form; error message inline.
  - Empty description shows a "+ add description" affordance for owners.
  - Persists via `POST /api/photo/[id]/meta` → `flickr.photos.setMeta` (signed
    via the `flickrAuth` helper). 401 if not signed in, 403 if not the owner.
  - Optimistic local update on success — no full page reload.
  - Live values reset when the route param changes (so paging away and back is
    clean).
- **Dockerized.** Multi-stage Dockerfile (Node 22 alpine) → final image ~230MB.
  Runs as non-root `node` user. Volume `/app/data` for persisting OAuth tokens
  across rebuilds. `HEALTHCHECK` polls `/`. `docker-compose.example.yml` copies
  to `docker-compose.yml`. Verified end-to-end: built → ran → `/health` round-
  tripped Flickr → `/user/lakatua/photostream` rendered 100 thumbnails.
- Switched `FLICKR_API_KEY` / `FLICKR_API_SECRET` from `$env/static/private`
  (build-time inlined) to `$env/dynamic/private` via `src/lib/server/env.ts`.
  Reason: with build-time env, the image bakes in whatever keys were set when
  the image was built — defeats the purpose of a portable container. With
  dynamic env, one image works for any consumer key/secret pair.
- README updated with both `npm run dev` and `docker compose up` instructions,
  plus a route map.
- `docker-compose.qnap.yml` for Container Station deployment on the NAS at
  `/share/ProgramData-vol5/Containers/contactsheet/` (mirrors Darkroom Log's
  layout). README has the rsync + paste-into-Container-Station flow.
  Image still builds on the NAS from source — no Docker Hub push required.
- **Security headers**, configured for going public:
  - **CSP** in `svelte.config.js` with `mode: 'auto'` — SvelteKit auto-adds
    nonces to its hydration scripts. Locked-down `default-src 'self'`,
    `frame-ancestors 'none'`, `object-src 'none'`. `style-src` keeps
    `'unsafe-inline'` because the lightbox morph relies on
    `style="view-transition-name: photo-{id}"` attributes (photo IDs are
    numeric Flickr IDs, no user-controlled content reaches a style attribute).
    `img-src` allows `*.staticflickr.com` and `data:`, `font-src` allows
    Google Fonts (IBM Plex). `form-action` allows the OAuth POST to flickr.com.
  - **`src/hooks.server.ts`** sets the rest: `X-Content-Type-Options: nosniff`,
    `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`,
    `Permissions-Policy` denying camera/mic/geo/etc., `Cross-Origin-Opener-Policy:
    same-origin`. `Strict-Transport-Security` is conditionally set when the
    incoming request is HTTPS (checked via `x-forwarded-proto` so Cloudflare
    Tunnel HTTPS termination is honored even though cloudflared talks to the
    container over HTTP inside the NAS).
- **Faves tab**: `/user/[id]/faves` paginated grid. Signed
  `flickr.favorites.getList` when viewer == target (returns own private + public
  faves), unsigned `flickr.favorites.getPublicList` otherwise. JSON pagination
  endpoint at `/api/user/[id]/faves`. Empty-state message for users with no
  public faves. Lightbox stream context tagged `tab: 'faves'` so close-button
  returns to the right grid.
- **Camera Roll tab**: `/user/[id]/camera-roll` — date-grouped variant of the
  photostream. Photos bucketed by `datetaken` month (e.g. "April 2026"), each
  bucket prefaced by a header with the count, infinite-scroll appends to the
  same buckets. Shown in the user nav only when viewing your own profile.
- **Stats tab**: `/user/[id]/stats` — self-only (server load 403's on mismatch).
  Renders `flickr.stats.getTotalViews` aggregate cards (total / photos /
  photostream / albums / galleries / collections) and the top-12 most-viewed
  photos via `flickr.stats.getPopularPhotos`, with a view-count overlay on each
  thumbnail. Catches Flickr error codes 1 + 99 to render a "Flickr Pro required"
  notice for non-Pro accounts instead of erroring out.
- **`<UserChrome>`** now takes an `isSelf` prop and conditionally appends the
  Camera Roll + Stats tabs only when viewing your own profile. Every consumer
  page passes `isSelf={data.me?.nsid === data.user.nsid}`.
- **Comments CSS fix**: the generic `article { display: grid; … }` rule on the
  page wrapper was bleeding into `<article class="comment">`, turning every
  comment into a broken 2-column grid where the header collided with the body
  text. Added `display: block` to `.comment` to override.
- **Groups tab** (`/user/[id]/groups`): grid of "tile" links, each going to
  `/group/[nsid]`. Roles ("admin", "invite-only", "18+") render as small badges
  next to the name when present. `flickr.people.getGroups` requires authenticated
  read perms even for public info, so this delegates to `flickrAuth` (which
  redirects unsigned visitors to /auth/start).
- **Galleries tab** (`/user/[id]/galleries` + `/gallery/[id]`): grid of gallery
  cover cards mirroring the Albums layout, plus a per-gallery detail page with
  the same paginated infinite-scroll grid pattern. JSON pagination endpoint at
  `/api/gallery/[id]/photos`. Lightbox stream context now also accepts
  `{ galleryId, tab: 'gallery' }` so close-button / arrow-paging stays inside
  the gallery context.
- **HTML-entity decoder**: Flickr returns several text fields (group names
  especially) HTML-entity-encoded — Svelte's `{}` then double-encodes the
  leading `&`, surfacing `&amp;quot;SEASCAPE&amp;quot;` instead of `"SEASCAPE"`.
  New `decodeFlickrEntities()` helper at `src/lib/flickr/text.ts` runs the
  decode pass before Svelte's interpolation. Applied to group names; other
  title fields (album / gallery / photo titles) likely need the same treatment
  but defer until a visible artifact pops up.
- All five tab slots in the user nav are now live (Photostream, Albums, Faves,
  Galleries, Groups), plus Camera Roll + Stats when viewing your own profile.
  Nothing greyed out anymore.
- Groups page UX: toolbar with a filter input ("Filter 200 groups…") and a
  Joined / A–Z sort toggle. Filter is case-insensitive substring match on the
  decoded display name; sort happens client-side, no extra API calls.
- Group detail page: explicit "← Back" button at the top that prefers
  `history.back()` when the referrer is same-origin, falls back to navigating
  home for direct deep-links.
- Lightbox exit affordances tightened up:
  - "← Back to {context}" button at the top of the metadata sidebar (context
    is the album / group / gallery / faves / etc. the photo was opened from)
  - Close X is now full-opacity instead of 55% by default — visible from the
    moment the lightbox opens, not just on figure hover
  - Trackpad swipe paging threshold bumped 90 → 180 px so casual two-finger
    horizontal motion (which on macOS competes with the browser's back-gesture)
    no longer accidentally pages through photos. Arrow keys, on-screen prev/
    next chevrons, and the close button remain the precise inputs.
- **Scroll-position-on-close fix (the real one)**: previous attempt gated the
  `history.back()` path on `document.referrer` being same-origin, which is
  unreliable for SPA navigation — SvelteKit client routing doesn't update
  `document.referrer`. Switched the gate to `streamCtx` existing in
  sessionStorage, which is set whenever the lightbox was entered from one of
  our grids. With `replaceState` on arrow paging + `history.back()` on close,
  closing the lightbox now consistently drops you back at the exact thumbnail
  in the grid, regardless of how many photos you arrowed through.
- **Search**: top-level search at `/search` (global Flickr) plus a header
  search input always available. Query params are `q` (text), `user` (resolved
  to NSID via `resolveUserId`, restricting results to that user's photos),
  `tags` (comma-separated, ANDed via `tag_mode=all`), `sort` (relevance /
  newest / oldest / recently-taken / earliest-taken / most-interesting / least-
  interesting). Backed by `flickr.photos.search`, no OAuth required. Same
  paginated infinite-scroll grid pattern as the rest of the app, JSON endpoint
  at `/api/search/photos`. Lightbox stream context now also accepts
  `{ searchPath, tab: 'search' }` so closing returns to the same query.
- **Lightbox swipe-up-to-close** (Darkroom Log Library tab parity): wheel
  handler now tracks vertical accumulator separately from horizontal — at
  `wheelAccumY < -80` with mostly-vertical motion (`|deltaX| < 40`), the
  lightbox closes. Doesn't `preventDefault` so the metadata aside still
  scrolls normally.
- **Back-button jitter fixes**:
  - `onNavigate` hook now skips View Transitions on `popstate` navigations.
    With 100+ named-element thumbnails (`view-transition-name: photo-{id}`),
    the browser was doing significant per-element snapshot work even on
    "back to where I was" — the morph adds value going forward but is just
    overhead going back. The user expects "back" to be instant.
  - **SvelteKit Snapshot API** on every grid page (photostream, album,
    group, gallery, faves, camera-roll, search). Captures the appended
    `photos` array, `currentPage`, and `totalPages` so a back navigation
    after `loadMore` restores the FULL list, not just the initial server-
    loaded 100. Without this, scroll restoration would clamp to a shorter
    page and the user would lose their place if they'd scrolled past the
    first batch.
- **SQLite cache layer** (`src/lib/server/cache.ts`, `data/cache.db`):
  - `better-sqlite3`-backed key-value store with TTL. WAL mode, expired-key
    purge every minute, single connection survives HMR via globalThis.
  - Wrapped through helpers that key by method name + sorted params:
    photo getInfo / getSizes / getExif (7-30d), comments (60s), people getInfo
    (1h), people getPhotos (60s), photoset list/photos (5m), gallery list /
    info / photos (5-60m), group info (24h) / pool (5m) / userGroups (5m),
    favorites public (5m) / own (30s), search results (60s),
    resolveUserId / resolveGroupId (30d).
  - Replaced the in-memory `Map`s in `users.ts` and `groups.ts` with the
    persistent cache so resolved NSIDs survive container restarts.
  - Photo metadata moved to a new `src/lib/server/flickr/photos.ts` so the
    photo page's load function is a thin Promise.all over four cached calls.
  - Added `getPersonInfo()` to `people.ts` and updated all 9 page server
    loads that fetched user info inline to use it — same call across
    photostream/albums/faves/galleries/groups/camera-roll/stats/album/gallery
    now hits the cache after the first request.
  - Cold-vs-warm timing: 421ms → 14ms on `/user/lakatua/photostream`
    (~30× faster on repeat visits). Cache db persists in the existing
    `/app/data` volume, gitignored.
- **Like / unlike a photo**: heart button on the lightbox figure (♡ outline /
  ♥ filled, accent color when faved). Visible only when signed in.
  Optimistic toggle with rollback on failure. Server-side
  `POST/DELETE /api/photo/[id]/fave` calls `flickr.favorites.add` /
  `.remove` and folds Flickr's "already faved" / "not in faves" error
  codes into success so first-click flips the visible state correctly
  regardless of prior state. Invalidates the user's own-faves cache so
  `/user/.../faves` reflects the change on next visit.
- **Add a comment**: textarea + Post button at the bottom of the comments
  section, visible only when signed in. Optimistic append on success
  (the new comment shows up instantly with the current user's name and
  the current timestamp). `POST /api/photo/[id]/comments` calls
  `flickr.photos.comments.addComment` and invalidates that photo's
  cached comment list so the next reload pulls the canonical entry.
