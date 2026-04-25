# ContactSheet

A better way to look at Flickr. A standalone explorer/viewer for Flickr that fixes the things
the official site gets wrong — dark backdrop, smooth grid↔image navigation, no buggy back-button
state, and a layout shaped around how a photographer actually wants to scan photos.

Sibling tool to Darkroom Log — same aesthetic family (IBM Plex, dark UI).

## Stack

- SvelteKit 2 + Svelte 5 (TypeScript)
- Node adapter (for Docker deployment later)
- Flickr REST API + hand-rolled OAuth 1.0a signing (no extra deps)
- Prettier

## Quick start

```sh
cp .env.example .env
# fill in FLICKR_API_KEY and FLICKR_API_SECRET (register at
# https://www.flickr.com/services/api/keys/apply)
npm install
npm run dev
```

Visit:

- `/` — landing
- `/health` — round-trips `flickr.test.echo` to confirm credentials work

## Project layout

```
src/
  app.html                          dark scheme + IBM Plex via Google Fonts
  routes/
    +layout.svelte                  global chrome (header, theme tokens)
    +page.svelte                    landing
    health/+page.server.ts          health-check load fn
    health/+page.svelte             health-check view
  lib/
    server/flickr/
      oauth.ts                      OAuth 1.0a HMAC-SHA1 signer
      client.ts                     flickr() wrapper (signed + unsigned calls)
```

## Roadmap

Mirror Flickr's profile nav as a per-user view (works for any Flickr user, not just self):

- About — `flickr.people.getInfo`
- Photostream — `flickr.people.getPhotos`
- Albums — `flickr.photosets.getList` / `getPhotos`
- Faves — `flickr.favorites.getList`
- Galleries — `flickr.galleries.getList`
- Groups — `flickr.people.getGroups` + `flickr.groups.pools.getPhotos`
- Stats — `flickr.stats.*` (own account only)
- Camera Roll — calendar-style (own account only)

Plus: search (own + global), single-photo view (EXIF, comments, faves, tags, map),
contacts/following.

## Secrets

`.env` is gitignored. Never commit Flickr keys.
