# Changelog

## [Unreleased]

### Added

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
