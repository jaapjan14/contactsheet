# ContactSheet

A better way to look at Flickr. A standalone explorer/viewer for Flickr that fixes the things
the official site gets wrong — dark backdrop, smooth grid↔image navigation, no buggy back-button
state (your scroll position is preserved across the lightbox), and a layout shaped around how a
photographer actually wants to scan photos.

Sibling tool to [Darkroom Log](https://hub.docker.com/r/jaap14/darkroom-log) — same aesthetic family (IBM Plex, dark UI).

![ContactSheet photostream](https://raw.githubusercontent.com/jaapjan14/contactsheet/main/screenshots/01-photostream.png)

The photo detail page surfaces EXIF, comments, fave/fave-count, location, plus collapsible
"In albums" / "In groups" / "Tags" disclosures — all in one place, all in-app (album and group
links route to ContactSheet's own views, not flickr.com).

![Photo detail with disclosures](https://raw.githubusercontent.com/jaapjan14/contactsheet/main/screenshots/02-photo-detail.png)

Search returns matching Flickr **groups** alongside photos, so you can jump from a query into
a community as easily as into a single image.

![Search with groups strip](https://raw.githubusercontent.com/jaapjan14/contactsheet/main/screenshots/03-search-with-groups.png)

**Source:** https://github.com/jaapjan14/contactsheet

## Quick start

```yaml
services:
  contactsheet:
    image: jaap14/contactsheet:latest
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      APP_PASSWORD: change-me
      SESSION_SECRET: generate-with-openssl-rand-base64-24
      FLICKR_API_KEY: your-flickr-api-key
      FLICKR_API_SECRET: your-flickr-api-secret
      ORIGIN: http://localhost:3000
    volumes:
      - ./data:/app/data
```

```sh
docker compose up -d
```

Open `http://localhost:3000`, enter `APP_PASSWORD`, then click **sign in to Flickr** to complete the OAuth dance.

## Getting Flickr API credentials

1. Go to https://www.flickr.com/services/api/keys/apply
2. Sign in with the Flickr account whose photos you'll be browsing
3. Pick **APPLY FOR A NON-COMMERCIAL KEY**
4. Fill in app name + description, accept terms, submit
5. Copy the **Key** and **Secret** into `FLICKR_API_KEY` / `FLICKR_API_SECRET`

The API has an undocumented but real rate limit (~3,600 calls/hour). ContactSheet's SQLite cache
absorbs most of it — most pages re-render from cache for several minutes after the first request.

## Configuration

| Variable | Required | Description |
|---|---|---|
| `APP_PASSWORD` | yes | Login password (gates the entire app) |
| `SESSION_SECRET` | yes | Random secret for session-cookie HMAC |
| `FLICKR_API_KEY` | yes | Your Flickr API key |
| `FLICKR_API_SECRET` | yes | Your Flickr API secret (used for OAuth 1.0a signing) |
| `ORIGIN` | yes | Public origin of this instance (e.g. `https://your.domain` or `http://localhost:3000`) |

## Volumes

| Path | Description |
|---|---|
| `/app/data` | SQLite cache (`cache.db`) and OAuth token (`auth.json`) — persist across image rebuilds |

## Tags

- `latest` — current release
- `vX.Y.Z` — pinned release

## Highlights

- 7-tab user view: photostream · about · albums · faves · galleries · groups · camera roll · stats
- Lightbox with EXIF, comments, fave/fave-count, "in albums/groups" disclosures, pinch/ctrl-wheel zoom
- High-res progressive load — preview paints instantly, X-Large 6K then Original swap in on fullscreen
- Combined search: free text + user + tags + sort, **also surfaces matching Flickr groups** in the same result set
- Background notifications poller — new faves, comments, and Explore hits, dedup'd by composite source ID
- SQLite response cache (better-sqlite3) wraps every Flickr API call with per-endpoint TTLs
- Hand-rolled OAuth 1.0a (no oauth dep) — HMAC-SHA1 signer, single-user token store
- App-password gate fronts every route with HMAC-signed session cookie + per-request CSP nonce
