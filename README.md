# ContactSheet

A better way to look at Flickr. A standalone explorer/viewer for Flickr that fixes the things
the official site gets wrong — dark backdrop, smooth grid↔image navigation, no buggy back-button
state (your scroll position is preserved across the lightbox), and a layout shaped around how a
photographer actually wants to scan photos.

Sibling tool to Darkroom Log — same aesthetic family (IBM Plex, dark UI).

## Stack

- SvelteKit 2 + Svelte 5 (TypeScript), Node adapter
- Flickr REST API + hand-rolled OAuth 1.0a signing (no oauth lib dependency)
- JSON-file token store (`data/auth.json`) — single user, personal tool

## Quick start (dev)

```sh
cp .env.example .env
# fill in FLICKR_API_KEY and FLICKR_API_SECRET
# (register at https://www.flickr.com/services/api/keys/apply)
npm install
npm run dev
```

Then visit `http://localhost:5173/` and click **sign in to Flickr** to complete the OAuth dance.

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

Use `docker-compose.qnap.yml`. The convention mirrors Darkroom Log:

```sh
# from the dev machine, sync source to NAS
# IMPORTANT: --exclude=.env so the NAS-specific .env (which has the
# tunnel ORIGIN, etc.) is never clobbered by your local dev .env.
rsync -av --delete \
    --exclude node_modules --exclude .svelte-kit --exclude build --exclude data \
    --exclude .git --exclude .env \
    ./ jtalakua@192.168.0.199:/share/ProgramData-vol5/Containers/contactsheet/

# on the NAS, place secrets next to the compose file (one-time)
ssh -p 1056 jtalakua@192.168.0.199 \
    'cat > /share/ProgramData-vol5/Containers/contactsheet/.env <<EOF
FLICKR_API_KEY=...
FLICKR_API_SECRET=...
ORIGIN=https://contactsheet.jjlnas.com
EOF'
```

Then Container Station → Applications → Create → paste the contents of
`docker-compose.qnap.yml` → Apply. First run builds; subsequent runs are
instant.

## What's there

| Route                            | What                                                          |
| -------------------------------- | ------------------------------------------------------------- |
| `/`                              | URL-aware input (user / group / single-photo URL all routed)  |
| `/user/[id]/photostream`         | Paginated infinite-scroll grid of any Flickr user's photos    |
| `/user/[id]/albums`              | Album list                                                    |
| `/album/[id]`                    | Per-album paginated grid                                      |
| `/group/[id]`                    | Group pool grid                                               |
| `/photo/[id]`                    | Lightbox: image, EXIF, comments, inline edit (owner only)     |
| `/health`                        | API key round-trip check                                      |
| `/auth/{start,callback,logout}`  | OAuth 1.0a sign-in / sign-out                                 |

Lightbox UX worth knowing: ← / → or two-finger swipe to page · click image or **F** for fullscreen ·
**Esc** or vertical swipe to close · arrow paging is `replaceState` so closing always returns to
your exact scroll position in the grid.

## Secrets

`.env` and `data/` are gitignored. Never commit Flickr keys or OAuth tokens.

## Roadmap

See `CHANGELOG.md` for what's shipped. Queued: Faves / Camera Roll / Stats tabs (OAuth-gated),
search (`flickr.photos.search`), SQLite cache layer, slideshow / Ken Burns mode, AI-tag cleanup
sweep over existing Flickr posts.
