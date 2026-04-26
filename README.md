# ContactSheet

A better way to look at Flickr. A standalone explorer/viewer for Flickr that fixes the things
the official site gets wrong — dark backdrop, smooth grid↔image navigation, no buggy back-button
state (your scroll position is preserved across the lightbox), and a layout shaped around how a
photographer actually wants to scan photos.

Sibling tool to Darkroom Log — same aesthetic family (IBM Plex, dark UI).

![ContactSheet photostream](screenshots/01-photostream.png)

The photo detail page surfaces EXIF, comments, fave/fave-count, location, plus collapsible
"In albums" / "In groups" / "Tags" disclosures — all in one place, all in-app (album and group
links route to ContactSheet's own views, not flickr.com).

![Photo detail with disclosures](screenshots/02-photo-detail.png)

Search returns matching Flickr **groups** alongside photos, so you can jump from a query into
a community as easily as into a single image.

![Search with groups strip](screenshots/03-search-with-groups.png)

## Stack

- SvelteKit 2 + Svelte 5 (TypeScript), Node adapter
- Flickr REST API + hand-rolled OAuth 1.0a signing (no oauth lib dependency)
- JSON-file token store (`data/auth.json`) — single user, personal tool

## Quick start (dev)

```sh
cp .env.example .env
# fill in FLICKR_API_KEY, FLICKR_API_SECRET, APP_PASSWORD, SESSION_SECRET
npm install
npm run dev
```

Then visit `http://localhost:5173/`, enter your `APP_PASSWORD` to clear the
gate, and click **sign in to Flickr** to complete the OAuth dance.

## Getting Flickr API credentials

ContactSheet talks to Flickr through their public REST API and signs
authenticated calls (favorites, comments, OAuth) with OAuth 1.0a. You need
your own API key + secret. They're free.

1. Go to **https://www.flickr.com/services/api/keys/apply**.
2. Sign in with the Flickr account whose photos you'll be browsing.
3. Pick **"APPLY FOR A NON-COMMERCIAL KEY"** (this is a personal viewer; no
   monetisation).
4. Fill in:
   - **What's the name of your app?** — anything; "ContactSheet" works.
   - **What are you building?** — a sentence is fine ("Personal Flickr
     viewer / lightbox").
   - Tick the "I acknowledge..." boxes and submit.
5. Flickr immediately shows you a **Key** and a **Secret**. Copy both into
   `.env` as `FLICKR_API_KEY` and `FLICKR_API_SECRET`.
6. Set the OAuth redirect to your deployment origin
   (`http://localhost:5173` for dev, your tunnel domain for prod). Most of
   the OAuth dance is signed with the secret rather than configured at
   Flickr's end, so you generally don't need to revisit this page once
   you've copied the credentials.

The API has an undocumented but real rate limit (~3 600 calls/hour). If you
hit it, ContactSheet's SQLite cache absorbs most of the load — most pages
re-render from cache for several minutes after the first request.

`APP_PASSWORD` is the gate that sits in front of the entire app — generate
one with `openssl rand -base64 24`. `SESSION_SECRET` HMACs the session
cookie so a stolen cookie can't be replayed; generate it the same way.

## Run with Docker

```sh
cp .env.example .env  # add your Flickr keys
cp docker-compose.example.yml docker-compose.yml
docker compose up --build -d
```

Then visit `http://localhost:3000/`. The `data/` directory is mounted as a volume so your OAuth
token survives image rebuilds.

For a one-off run without compose:

```sh
docker build -t contactsheet .
docker run -p 3000:3000 \
    -e FLICKR_API_KEY="..." \
    -e FLICKR_API_SECRET="..." \
    -e ORIGIN="http://localhost:3000" \
    -v "$(pwd)/data:/app/data" \
    contactsheet
```

## Deploy to QNAP (Container Station)

Use `docker-compose.qnap.yml`. The convention mirrors Darkroom Log. Replace
the `<…>` placeholders with your own NAS host, SSH user/port, and target path.

```sh
# from the dev machine, sync source to NAS
# IMPORTANT: --exclude=.env so the NAS-specific .env (which has the
# tunnel ORIGIN, etc.) is never clobbered by your local dev .env.
rsync -av --delete \
    --exclude node_modules --exclude .svelte-kit --exclude build --exclude data \
    --exclude .git --exclude .env \
    ./ <user>@<nas-host>:/path/to/contactsheet/

# on the NAS, place secrets next to the compose file (one-time)
ssh <user>@<nas-host> \
    'cat > /path/to/contactsheet/.env <<EOF
FLICKR_API_KEY=...
FLICKR_API_SECRET=...
ORIGIN=https://your-domain.example
EOF'
```

Then Container Station → Applications → Create → paste the contents of
`docker-compose.qnap.yml` → Apply. First run builds; subsequent runs are
instant.

## What's there

| Route                            | What                                                                   |
| -------------------------------- | ---------------------------------------------------------------------- |
| `/`                              | URL-aware input (user / group / album / single-photo URL all routed)   |
| `/user/[id]/photostream`         | Paginated infinite-scroll grid of any Flickr user's photos             |
| `/user/[id]/about`               | Bio, total views, location, "most popular" grid                        |
| `/user/[id]/albums`              | Album list                                                             |
| `/user/[id]/faves`               | Faves grid (OAuth-gated, owner only)                                   |
| `/user/[id]/galleries`           | Galleries the user has curated                                         |
| `/user/[id]/groups`              | Groups the user belongs to (OAuth-gated)                               |
| `/user/[id]/camera-roll`         | Camera-by-camera grouped grid                                          |
| `/user/[id]/stats`               | Top photos by views                                                    |
| `/album/[id]`                    | Per-album paginated grid                                               |
| `/gallery/[id]`                  | Per-gallery paginated grid                                             |
| `/group/[id]`                    | Group pool grid                                                        |
| `/photo/[id]`                    | Lightbox: image, EXIF, comments, fave, "in albums/groups", high-res zoom |
| `/explore`                       | Today's Explore feed                                                   |
| `/search`                        | Free-text + user + tags + sort, also surfaces matching Flickr groups   |
| `/notifications`                 | Background-polled feed of new faves / comments / Explore hits          |
| `/health`                        | API-key round-trip check                                               |
| `/auth/{start,callback,logout}`  | OAuth 1.0a sign-in / sign-out                                          |

Lightbox UX worth knowing: ← / → or two-finger swipe to page · click image or **F** for fullscreen ·
**Esc** or vertical swipe → exit fullscreen → close, in that order · pinch / ctrl+wheel to zoom ·
arrow paging is `replaceState` so closing always returns to your exact scroll position in the grid.

When fullscreen is active a higher-resolution variant of the image (X-Large 6K, then Original where
allowed) preloads progressively so zoomed-in views are pixel-for-pixel parity with flickr.com.

## Architecture notes

- **SQLite cache layer** (`src/lib/server/cache.ts`) — every Flickr response
  is wrapped in `wrap(key, ttl, fn)`. TTLs vary by endpoint volatility
  (sizes: 24 h, search: 5 min, person info: 1 h). Persists to `data/cache.db`.
- **Notifications poller** (`src/lib/server/notifications/poller.ts`) — runs
  every 15 min, calls `flickr.activity.userPhotos` and intersects today's
  Explore feed with the user's most-recent uploads. Dedup is by composite
  source-id so the same fave/comment never fires twice.
- **OAuth 1.0a, hand-rolled** (`src/lib/server/flickr/oauth.ts`) — no oauth
  library; HMAC-SHA1 signer + nonce/timestamp generation. Token stored in
  `data/auth.json`, single user.
- **App-password gate** (`src/hooks.server.ts`) — every route that isn't
  `/login` or static-asset is fronted by an HMAC'd session cookie. CSP is
  generated by SvelteKit's built-in `kit.csp` with a per-request nonce.

## Secrets

`.env` and `data/` are gitignored. Never commit Flickr keys, app password,
session secret, or OAuth tokens.

## Roadmap

See `CHANGELOG.md` for what's shipped.

### Planned

- **Slideshow / Ken Burns mode** — fullscreen auto-advance with subtle pan
  + zoom; per-album playlist; pause-on-tap and timeline scrubber.
- **AI-assisted tag cleanup sweep** — review existing photo tags against a
  small classifier, surface "probably wrong" / "missing obvious" lists for
  one-click apply via `flickr.photos.setTags`.
- **Mobile polish pass** — search-page sticky header, photo-detail
  bottom-sheet on small screens, "share" sheet integration.
- **In-app comment compose for non-owner photos** — currently the compose
  field shows for own-photos only; worth opening it up when authed.

### Considered (not yet decided)

- **Multi-user** — let a friend log in with their own Flickr account on the
  same instance. Would need NSID-keyed `auth.json` + per-user session
  scoping. Pretty invasive given the current single-token assumption.
- **Public sharable lightbox links** — a per-photo URL that bypasses the
  app-password gate but only renders one image + EXIF (no nav, no tabs).
  Useful for sending to family who don't want to think about Flickr.
- **Local image cache** — the SQLite layer caches API responses but not the
  pixel data. A 1 GB on-disk LRU of `_z`/`_k` JPEGs would make a
  reload-and-scroll-the-grid pattern feel instantaneous, at the cost of
  cache-invalidation complexity when a user re-edits a photo on Flickr.
- **Bulk-edit tools** — multi-select on the photostream grid → batch
  add-to-album, batch tag, batch privacy. The Flickr API supports these,
  but the UX for selection on a paginated infinite-scroll grid is its own
  design problem.
- **Soft-delete inbox** — a "deleted by accident" view that survives for
  30 days. Flickr itself doesn't have one, and learning to trust deletions
  again would be its own kind of relief.
- **Comparison view** — pick two photos side-by-side at fullscreen for
  edit-vs-original or A/B-take comparison.
- **Albums with smart rules** — "every photo with tag X taken with camera
  Y", refreshed daily.
- **Slack / Pushover relay for notifications** — instead of (or in addition
  to) the in-app bell, ping a webhook on a new Explore hit.
