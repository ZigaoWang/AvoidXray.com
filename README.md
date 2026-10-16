<a href="https://AvoidXray.com"><img src="https://AvoidXray.com/opengraph-image" alt="AvoidXray: a grid of community film photos behind the logo and live counts of photos, films and cameras" width="100%"></a>

<p align="center">
  <b>See what a roll of film looks like before you buy one.</b><br>
  <a href="https://AvoidXray.com">AvoidXray.com</a>
</p>

AvoidXray is a community archive of film photography. People upload their scans
and tag each frame with the camera and film stock it was shot on, and every stock
and every camera gets a page built from those frames.

Manufacturer samples are shot by professionals in good light and scanned on
equipment most people don't own. They show what a stock can do. The frames here
show what it did for someone else, scanned however they scan. Uploads are stored
as they arrived, with GPS coordinates stripped from the EXIF.

<p>
  <a href="https://AvoidXray.com/films/kodak-ultramax-400"><img src="https://AvoidXray.com/films/kodak-ultramax-400/opengraph-image" alt="The Kodak UltraMax 400 page" width="49%"></a>
  <a href="https://AvoidXray.com/cameras/canon-ae-1-program"><img src="https://AvoidXray.com/cameras/canon-ae-1-program/opengraph-image" alt="The Canon AE-1 Program page" width="49%"></a>
</p>

## Features

- Bulk upload with camera and film tagging; the original file is kept
- A page for every film stock and camera, plus film-and-camera pairings
- Explore feeds (random, recent, popular by week, month, year or all time, following)
- Albums, follows, likes, comments and notifications
- Community notes on gear pages, voted on by people who shot it
- Public or private per photo, blocking, reporting
- Export sheets and watermarked downloads
- An admin panel with a review queue for catalog changes and a lookup by id or link

## Stack

Next.js 16 (App Router), React 19, TypeScript, Tailwind 4, Prisma 6 on
PostgreSQL 14, NextAuth (JWT sessions), sharp for images, Aliyun OSS for storage,
Mailtrap for email and self-hosted Umami for analytics. About 50 pages, 50 API
routes and 22 models.

## Running locally

Node 20 or later and PostgreSQL.

```bash
npm install                 # also runs prisma generate
cp .env.example .env        # fill in DATABASE_URL and NEXTAUTH_SECRET at minimum
npx prisma migrate deploy
npm run dev
```

Uploads need Aliyun OSS credentials and email needs a Mailtrap key. The rest of
the site runs without them, and analytics stays off unless the Umami variables
are set.

| Command | |
|---|---|
| `npm run dev` | Development server |
| `npm run build` | Production build, then a check that no client chunk carries the database client |
| `npm test` | The test scripts in `scripts/test` |
| `npm run lint` | ESLint |
| `npx tsc --noEmit` | Type check |

```
src/app/          Routes; api/ holds the route handlers
src/components/   Shared UI; ui/ is the design system
src/lib/          Domain logic
src/proxy.ts      Runs before rendering: 404s, redirects, private records
prisma/           Schema and migrations
scripts/          Tests, backfills and catalog loaders
docs/             Design notes and the catalog writing standard
```

## Engineering notes

The site runs as a single process on one VPS (6 cores, 8GB) shared with other
services, and film scans are large: uploads average about 8MB and the largest on
record is 7956×7483. Most of the decisions below come from that.

**The image pipeline budgets decoded pixels, not bytes.** A 2MB PNG can decode to
400 megapixels while a 50MB scan is modest, so `sharpConfig.ts` caps input
pixels, libvips threads and cache rather than trusting an upload limit. Each
upload produces a thumbnail, a display rendition and the untouched original, one
at a time, so two full-size decodes are never in flight together.

**Capacity is read from the machine.** Render slots and thread counts come from
`capacity.ts`, which logs its decision on startup:

```
[capacity] 6 cores, 8001MB total, 5 render slots, libvips concurrency 6
```

The previous hand-written numbers were sized for a 3-core, 2GB box and stayed in
force through two upgrades without anything saying so. Memory ceilings are the
exception: each is a literal citing a peak measured against real scans.

**The image cache does the job of a CDN.** `/_next/image` is about 40% of all
requests, and resizing from local disk is two to three times faster than a round
trip to object storage. `prune-image-cache.mjs` keeps it inside a disk budget,
and `clear-build-cache.mjs` exists because `rm -rf .next/cache` before a build
would throw that cache away on every deploy.

**Feeds are seeded, not random.** A grid that reshuffles on every render loses
your place when you come back from a photo, and disagrees with its own server
HTML. Ordering by `md5(id || seed)` gives variety that survives the round trip,
and prev/next on a photo follows the same order as the grid it came from.

**One function decides who can see a photo.** About forty queries need the rule,
so they all go through `photoVisibility.ts`. `check-api-leaks.ts` walks every
route and asserts against real responses, because the first `passwordHash` leak
fixed by hand missed an identical second call a few lines further down.

**Catalog content is data, not code.** Film and camera descriptions and specs
live in the database and are never committed. Changes from contributors and from
research scripts land in a review queue as revisions with a cited source per
field, and an admin accepts or refuses them. The loaders in `scripts/` are
tracked; the batches they load are gitignored.

**Schema changes are migrations.** Deploys apply `prisma/migrations`, and CI
replays every migration into an empty PostgreSQL 14 database and fails if the
result drifts from `schema.prisma` or a CHECK constraint has gone missing.
Pre-Prisma history is kept in `docs/legacy-migrations`.

## Rules the code depends on

- Photo visibility goes through `photoVisibility.ts`. Spread `PUBLIC_PHOTO`, or
  use `visibleToViewer(viewerId)` for a feed that belongs to the viewer.
- `feedWhere` and `feedScopeSql` must agree. The random tab needs raw SQL, so
  `photoFeed.ts` has both, and the types refuse a `FeedScope` key that only one
  of them handles.
- Never `include: { user: true }`, which returns `passwordHash`. Use
  `publicUserSelect` or `bylineUserSelect`.
- Storage keys never change. Objects are served `immutable` for a year, so a
  replaced image gets a new key.
- Rate limits live in `rateLimitPolicy.ts`. The limiter, the render semaphore and
  the source cache are in-process, which is why the app runs as one pm2 fork.
- A new top-level route goes in `topLevelRoutes.ts`; otherwise the proxy reads
  it as a username. A test checks the list against the route tree.
- Build UI from `components/ui/` rather than restyling in place.

Tests cover the logic where a wrong answer is quiet rather than loud: rate
limits, feed scope, visibility, the image pipeline, EXIF stripping, duplicate
detection, blocks and catalog writes. There is no browser suite, so UI changes
are checked by using them.

## Production

pm2 runs the app from `ecosystem.config.js`:

```bash
pm2 start ecosystem.config.js
pm2 save
```

Start it from that file, not with `pm2 start npm -- run start`. With npm in
between, pm2 supervises the shell: it reported 79MB while the Next process under
it held 1.3GB, so the memory limit watched something that never grows. The
config also sets `UV_THREADPOOL_SIZE` from the core count, since sharp queues
every render on a libuv thread and a pool smaller than the render slots is a
ceiling nothing reports.

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md) first; it covers the product standard
and how the UI is built. Catalog copy follows
[docs/writing-standard.md](docs/writing-standard.md), and the name and logo
follow [BRANDING.md](BRANDING.md).

Commits are one change each, as [Conventional Commits](https://www.conventionalcommits.org)
with no scope. `style:` means code formatting, not CSS.

## License

© Zigao Wang. All rights reserved.

The source is public for reference only. It is not open source: no permission is
given to use, copy, modify or distribute the code, or the AvoidXray name and
branding.
