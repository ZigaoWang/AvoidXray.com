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

## What it does

- **Upload** scans in bulk and tag each with its camera and film. The original is
  kept; GPS is removed.
- **Browse** every film stock, camera and film-and-camera pairing, each a page of
  community photos with specs, notes and related gear.
- **Explore** by random, recent, popular (this week, month, year or all time) or
  the people you follow.
- **Share** with albums, follows, likes, comments, community notes and
  notifications.
- **Export** a photo as a print, filmstrip, negative, slide or instant print, at
  social sizes or sized for paper, singly or as a batch.
- **Moderate** from an admin panel with a review queue for catalog changes,
  reports, bulk editing and a lookup that takes any id or link.

## How it's built

Next.js 16 (App Router), React 19, TypeScript and Tailwind 4, on PostgreSQL 14
through Prisma 6. Images are processed with sharp and stored in Aliyun OSS.
NextAuth handles sessions, Mailtrap sends email and a self-hosted Umami counts
visits. About 50 pages, 50 API routes and 22 models, running as one process on
one 6-core, 8GB server that it shares with other services.

The parts worth reading about:

- **Images on a memory budget.** Scans run to 50MB and 60 megapixels. Limits
  are set in decoded pixels, renditions are made one at a time, and exports
  share a render semaphore sized from the machine. A 62MP print export renders
  in under a second, after measuring which encoder settings were worth it.
  [docs/images.md](docs/images.md)
- **A catalog that cites its sources.** Every edit to a film or camera is a
  revision, reviewed field by field and applied in one transaction with a
  record of where each value came from. Research is loaded by scripts that
  refuse a value the cited passage does not state.
  [docs/catalog.md](docs/catalog.md)
- **Feeds that agree with themselves.** The first screen and every page after it
  share one definition, random orders are seeded so Back returns you to the
  same grid, and prev/next on a photo walks the order of the grid you came from.
  [docs/architecture.md](docs/architecture.md)
- **Privacy in one place.** One module decides who can see a photo, a script
  calls every API route looking for leaked fields, and the build fails if the
  database client reaches the browser.
  [docs/security.md](docs/security.md)
- **A schema CI can prove.** Every migration is replayed into an empty database
  on each push, checked against the schema, and the constraints Prisma cannot
  see are tested for existence and effect.
  [docs/operations.md](docs/operations.md)

## Running locally

Node 20 or later and PostgreSQL.

```bash
npm install                 # also runs prisma generate
cp .env.example .env        # DATABASE_URL and NEXTAUTH_SECRET at minimum
npx prisma migrate deploy
npm run dev
```

Uploads need Aliyun OSS credentials and email needs a Mailtrap key. The rest of
the site runs without them.

| Command | |
|---|---|
| `npm run dev` | Development server |
| `npm run build` | Production build, then a check that the database client stayed out of the browser |
| `npm test` | Tests in `scripts/test` that need no database |
| `npm run lint` | ESLint |
| `npx tsc --noEmit` | Type check |

```
src/app/          Pages and API route handlers
src/components/   Shared UI; ui/ is the design system
src/lib/          Domain logic: feeds, visibility, revisions, images, exports
src/proxy.ts      Runs before rendering: real 404s, redirects, private records
prisma/           Schema, migrations and SQL constraint tests
scripts/          Tests, catalog loaders, backfills and maintenance
docs/             How it works
```

## Documentation

| | |
|---|---|
| [Architecture](docs/architecture.md) | Request flow, data model, feeds, the grid, the UI system |
| [Images](docs/images.md) | Upload, processing, storage, the image cache, exports |
| [Catalog](docs/catalog.md) | Film and camera records, revisions, provenance, research loaders, slugs, SEO |
| [Security](docs/security.md) | Accounts, sessions, visibility, blocking, rate limits, leak checks |
| [Operations](docs/operations.md) | Process model, deploys, CI, tests, scheduled jobs |
| [Database objects](docs/db-objects.md) | Constraints, triggers and indexes that live outside the Prisma schema |
| [Branding](BRANDING.md) | Name, logo, color, type and writing |

## Working on it

- One change per commit, as [Conventional Commits](https://www.conventionalcommits.org)
  with no scope. `style:` means code formatting, not CSS.
- Before building a component, look for the one that already does the job.
  Fix a problem everywhere it occurs, not on the one page where it was noticed.
- Catalog facts need a source before they go in. A blank field is better than a
  guess, because a wrong value looks authoritative and never gets corrected.
- Run `npx tsc --noEmit`, `npm run lint`, `npm test` and `npm run build` before
  pushing.
- A new top-level route goes in `src/lib/topLevelRoutes.ts`, or the proxy reads
  it as a username.
- Never `include: { user: true }`; it returns the password hash. Use
  `publicUserSelect` or `bylineUserSelect`.

## License

© Zigao Wang. All rights reserved.

The source is public for reference only. It is not open source: no permission is
given to use, copy, modify or distribute the code, or the AvoidXray name and
branding.
