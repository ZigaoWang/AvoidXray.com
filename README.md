<a href="https://AvoidXray.com"><img src="docs/cover.webp" alt="AvoidXray" width="100%"></a>

# AvoidXray

**See what a roll of film actually looks like before you buy one.**

[AvoidXray.com](https://AvoidXray.com)

AvoidXray is a community archive of film photography. People upload their scans
and tag each frame with the camera and the film stock it was shot on. Every
stock and every camera then has a page built entirely out of those frames.

## Why it exists

Sample images for a film stock usually come from the manufacturer. They are shot
by a professional, on a tripod, in good light, and scanned on equipment you do
not own. They show you what the stock is capable of, not what it will do for
you.

This shows the other thing. Every photo on a stock or camera page was taken by
someone in the community and scanned however they scan. Uploads are stored
exactly as they arrived, apart from stripping the GPS coordinates out of the
EXIF.

<p>
  <a href="https://AvoidXray.com/films/kodak-ultramax-400"><img src="docs/film-ultramax.webp" alt="The Kodak UltraMax 400 page, with 195 sample photos" width="49%"></a>
  <a href="https://AvoidXray.com/cameras/canon-ae-1-program"><img src="docs/camera-ae1.webp" alt="The Canon AE-1 Program page, with 501 sample photos" width="49%"></a>
</p>

## What it does

- Upload scans in bulk, tag them with camera and film stock, keep the original file
- A page for every film stock and every camera, assembled from community frames
- Albums, following, likes and comments
- Community notes on gear pages, with voting, so corrections come from people who shot it
- Public or private per photo
- Reporting, blocking and a moderation queue for user-submitted gear

## How it's built

Next.js (App Router), React 19, TypeScript, Prisma on PostgreSQL, NextAuth,
sharp, Aliyun OSS. Around 40 pages, 50 API routes and 17 models.

It runs on one small VPS with 2GB of memory, and film scans are large: uploads average
about 8MB and the biggest on record is 7956x7483. Most of the interesting
decisions come from that.

**The image pipeline budgets decoded pixels, not file size.** A 2MB PNG can
decode to 400 megapixels while a 50MB scan is comparatively modest, so
`sharpConfig.ts` caps input pixels, libvips threads and cache rather than
trusting an upload limit. Each upload produces a thumbnail, a display rendition
and an untouched original, generated one at a time so two full-size decodes are
never in flight together.

**The image cache is doing the job of a CDN.** `/_next/image` is around 40% of
all requests, and resizing from local disk is 2 to 3 times faster than
round-tripping to object storage. `prune-image-cache.mjs` holds it inside a disk
budget, and `clear-build-cache.mjs` exists because the obvious
`rm -rf .next/cache` before a build throws the whole thing away on every deploy.

**Feeds are seeded rather than random.** A grid that reshuffles on every render
loses your place when you come back from a photo, and a component that shuffles
during render disagrees with its own server HTML. Ordering by `md5(id || seed)`
gives variety that survives a round trip.

**One function decides who can see a photograph.** There are roughly forty
queries that need the rule, and a rule remembered forty times is one that will
eventually be forgotten, so they all go through `photoVisibility.ts`.
`check-api-leaks.ts` then walks every route and asserts against real responses,
because the first time a `passwordHash` leak was fixed by hand it missed an
identical second call a few lines further down.

## Running it

Node 20+ and PostgreSQL.

```bash
npm install
cp .env.example .env      # fill in
npx prisma generate
npx prisma db push        # first run only
npm run dev
```

Uploads need Aliyun OSS credentials and email needs a Mailtrap key. Everything
else runs without them.

| Command | |
|---|---|
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm test` | 144 assertions |
| `npm run lint` | ESLint |

```
src/app/          Routes; api/ holds route handlers
src/components/   Shared UI; ui/ is the design system
src/lib/          Domain logic
scripts/          Tests and maintenance tools
prisma/           Schema; migrations are hand-written SQL in scripts/sql
```

## Reading the code

A few rules the codebase depends on:

- Photo visibility goes through `photoVisibility.ts`. Spread `PUBLIC_PHOTO`, or
  use `visibleToViewer(viewerId)` for a feed belonging to the person viewing it.
- `feedWhere` and `feedScopeSql` have to agree. The random tab needs raw SQL, so
  `photoFeed.ts` carries two implementations and the types stop you adding a
  `FeedScope` key without handling both.
- Never `include: { user: true }`. It returns `passwordHash`. Use
  `publicUserSelect` or `bylineUserSelect`.
- Storage keys never change. Objects are served `immutable` for a year, so
  replacing an image means a new key and a database update.
- Rate limits all live in `rateLimitPolicy.ts`. The limiter is in-process, so it
  is correct only while this runs as a single pm2 fork.
- Build UI from `components/ui/`. Restyling in place is how a site ends up with
  eight kinds of link.

Tests cover the logic where a wrong answer is silent rather than loud: rate
limiting, feed scope, profile URLs, link parsing, the image pipeline, duplicate
detection, blocks, feedback state and EXIF stripping. There is no component or
browser suite, so UI changes are checked by using them.

Commits are one change each, [Conventional Commits](https://www.conventionalcommits.org).
`style:` means formatting, not CSS.

## Licence

© Zigao Wang. All rights reserved.

Public for reference only. This is not open source: no permission is given to
use, copy, modify or distribute this code, or the AvoidXray name and branding.
