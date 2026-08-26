<img src="public/logo.svg" alt="AvoidXray" width="200"/>

# AvoidXray

A community for film photography. People upload scans and tag them with the
camera and film stock they were shot on; every stock and camera then has a page
showing what it actually looks like.

[AvoidXray.com](https://avoidxray.com)

## Setup

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
| `npm test` | Rate limiting, feed scope, profile URLs, link parsing, image pipeline |
| `npm run lint` | ESLint |

## Layout

Next.js App Router, Prisma, PostgreSQL, NextAuth, sharp, Aliyun OSS.

```
src/app/          Routes; api/ holds route handlers
src/components/   Shared UI
src/lib/          Domain logic
scripts/          Tests and maintenance tools
prisma/           Schema; migrations are hand-written SQL in scripts/sql
```

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

**Storage keys are immutable.** Objects are served `max-age=1y, immutable`, so
replacing an image means a new key plus a database update, never an overwrite.

**Image limits** live in `src/lib/sharpConfig.ts`. File size is a poor proxy for
memory — a small PNG can decode to hundreds of megapixels.

## Tests

`npm test` covers logic where a wrong answer is silent rather than loud. There
is no component or browser suite, so check UI changes by using them.

## Commits

One change each, [Conventional Commits](https://www.conventionalcommits.org).
`style:` means formatting, not CSS.

## Licence

© Zigao Wang. All rights reserved.

Public for reference only. Not open source: no permission is given to use,
copy, modify or distribute this code or the AvoidXray name and branding.
