<img src="public/logo.svg" alt="AvoidXray" width="180"/>

# AvoidXray

A community for film photography. People upload scans and tag them with the
camera and film stock they were shot on, so every stock and camera has a page
showing how it actually renders.

[AvoidXray.com](https://AvoidXray.com)

## Stack

Next.js (App Router), React 19, TypeScript, Prisma on PostgreSQL, NextAuth,
sharp, Aliyun OSS. 40 pages, 50 API routes, 17 models.

## Setup

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

## Structure

```
src/app/          Routes; api/ holds route handlers
src/components/   Shared UI; ui/ is the design system
src/lib/          Domain logic
scripts/          Tests and maintenance tools
prisma/           Schema; migrations are hand-written SQL in scripts/sql
```

## Things worth knowing

**Photo visibility lives in one file.** `src/lib/photoVisibility.ts` decides who
can see a photo, and it is the only thing that does. Spread `PUBLIC_PHOTO`, or
use `visibleToViewer(viewerId)` for a feed belonging to the person viewing it.

**`feedWhere` and `feedScopeSql` have to agree.** The random tab orders by a
seeded `md5`, which needs raw SQL, so `src/lib/photoFeed.ts` carries two
implementations. The types stop you adding a `FeedScope` key without handling
both.

**Never `include: { user: true }`.** It returns every column, `passwordHash`
included. Use `publicUserSelect` or `bylineUserSelect`.
`scripts/check-api-leaks.ts` checks real responses across every route.

**Storage keys never change.** Objects are served `immutable` for a year, so
replacing an image means writing a new key and updating the database.

**Image limits are about decoded pixels, not file size.** A 2MB PNG can decode
to 400 megapixels. The caps are in `src/lib/sharpConfig.ts`.

**Feeds are seeded rather than random.** Reshuffling on every render loses your
place when you come back from a photo, and a client that shuffles during render
disagrees with its own server HTML. See `src/lib/seededShuffle.ts`.

**Do not clear `.next/cache` wholesale.** `.next/cache/images` is the image
optimizer's cache, it is expensive to rebuild, and nothing in a build
invalidates it. `scripts/clear-build-cache.mjs` clears the rest and keeps it.

**Rate limits are policy, kept together.** All of them are in
`src/lib/rateLimitPolicy.ts`. The limiter is in-process, so it stays correct
only while this runs as a single pm2 fork.

**Use the UI primitives.** `src/components/ui/` holds the button, field, label,
dialog, menu and toast. Restyling in place is how a site ends up with eight
kinds of link.

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
