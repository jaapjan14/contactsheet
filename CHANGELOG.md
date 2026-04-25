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
