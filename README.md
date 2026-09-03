<img src="public/logo.svg" alt="AvoidXray" width="200"/>

# AvoidXray

A community for film photography. People upload scans and tag them with the
camera and film stock they were shot on; every stock and camera then has a page
showing what it actually looks like, built from frames real people shot rather
than from a manufacturer's sample sheet.

**[avoidxray.com](https://avoidxray.com)**

Next.js App Router, React 19, TypeScript, Prisma on PostgreSQL, NextAuth, sharp,
Aliyun OSS. Roughly 33k lines across 40 pages, 50 API routes and 17 models.

## What shaped it

It runs on one 3-core, 2GB VPS in Los Angeles against object storage in Hong
Kong, and film scans are unusually large — 10MB is ordinary and the biggest on
record is 7956×7483 at 49.5MB. Most of what follows comes from those two facts.

**Decoded size is the limit that matters, not file size.** A 2MB PNG can decode
to 400 megapixels, while a 50MB scan is comparatively modest.
`src/lib/sharpConfig.ts` caps input pixels, libvips threads and cache, because
sharp's defaults assume more headroom than this machine has.

**The image cache is doing the work of a CDN.** `/_next/image` is about 40% of
all requests, and resizing from local disk is 2–3x faster than fetching from
Hong Kong, so the cache is effectively a US edge.
`scripts/prune-image-cache.mjs` keeps it inside a disk budget, and
`scripts/clear-build-cache.mjs` exists because the obvious `rm -rf .next/cache`
in a prebuild step silently throws all of it away on every deploy.

**Feeds are seeded rather than random.** A grid that reshuffles on every render
loses your place when you come back from a photo, and a client that shuffles
during render disagrees with its own server HTML. `src/lib/seededShuffle.ts`
and the `md5(id || seed)` ordering in the raw feed queries give variety that
survives a round trip.

**Privacy is one function, not forty conditions.** `photoVisibility.ts` is the
only thing that decides who may see a photograph, because a rule that has to be
remembered at forty call sites is one that will eventually be forgotten.

## Before you change things

**Photo visibility.** `src/lib/photoVisibility.ts` decides who can see a
photograph, and it is the only place that does. Spread `PUBLIC_PHOTO`, or use
`visibleToViewer(viewerId)` for a feed belonging to the person viewing it.

**Feed filtering.** `src/lib/photoFeed.ts` has two implementations — the random
tab orders by a seeded `md5` and needs raw SQL. `feedWhere` and `feedScopeSql`
have to agree; the types enforce it, so adding a key to `FeedScope` will not
compile until both handle it.

**Never `include: { user: true }`.** It returns every column, `passwordHash`
included. Use `publicUserSelect` or `bylineUserSelect`.
`scripts/check-api-leaks.ts` walks every route and asserts against real
responses, because the first time this was fixed by hand it missed an identical
second call a few lines further down.

**Storage keys are immutable.** Objects are served `max-age=1y, immutable`, so
replacing an image means a new key plus a database update, never an overwrite.

**Rate limits are a policy, not a scattering.** They sit together in
`src/lib/rateLimitPolicy.ts` so they can be reviewed as one. The limiter is
in-process and stays correct only while this runs as a single pm2 fork.

**One look per control.** `src/components/ui/` holds the button, field, label,
dialog, menu and toast every surface is built from. There were once eight
inline link styles, ten input variants and two different hover reds on the same
button; which one you got depended on the file.

## Running it

Node 20+ and PostgreSQL.

```bash
npm install
cp .env.example .env      # fill in
npx prisma generate
npx prisma db push        # first run only
npm run dev
```

Uploads need Aliyun OSS credentials and email needs a Mailtrap key; the rest
runs without them.

| | |
|---|---|
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm test` | 144 assertions, no watch mode |
| `npm run lint` | ESLint |

```
src/app/          Routes; api/ holds route handlers
src/components/   Shared UI; ui/ is the design system
src/lib/          Domain logic
scripts/          Tests and maintenance tools
prisma/           Schema; migrations are hand-written SQL in scripts/sql
```

## Tests

`npm test` covers the logic where a wrong answer is silent rather than loud:
rate limiting, feed scope, profile URLs, link parsing, the image pipeline,
duplicate detection, blocks, feedback state and EXIF stripping. There is no
component or browser suite, so UI changes are checked by using them.

## Commits

One change each, [Conventional Commits](https://www.conventionalcommits.org).
`style:` means formatting, not CSS.

## Licence

© Zigao Wang. All rights reserved.

Public for reference only. Not open source: no permission is given to use,
copy, modify or distribute this code or the AvoidXray name and branding.
