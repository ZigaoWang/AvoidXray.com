# Operations

How it runs, how it ships and what keeps it healthy.

## Process

pm2 runs the Next binary directly from `ecosystem.config.js`:

```bash
pm2 start ecosystem.config.js
pm2 save
```

- **Not through npm.** With `pm2 start npm -- run start`, pm2 supervised the
  shell: it reported 79MB while the Next process under it held 1.3GB, so the
  memory limit watched something that never grows.
- **One fork, never cluster.** The render semaphore, the source image cache and
  the rate limiter are in process memory. A second worker would double every
  bound they enforce.
- **`UV_THREADPOOL_SIZE`** is set from the render slot count. sharp queues every
  render on a libuv thread, and a pool smaller than the slots is a ceiling
  nothing reports. A `RENDER_SLOTS` override, from the shell or `.env`, is read
  here too and passed to the app, so the pool and the semaphore agree.
- **Bound to `127.0.0.1:3000`.** nginx proxies to it; nothing else should
  reach Next directly. nginx's `proxy_pass` must name `127.0.0.1`, not
  `localhost`, which can resolve to `::1`.
- **Restarts back off** (`exp_backoff_restart_delay`), so a crash at startup
  does not respawn in a tight loop. For the vision worker that loop reloaded
  2GB of models each time.
- **`max_memory_restart` 3G**, since a full-size print export peaks around
  1.2GB. **`kill_timeout` 10s**, because the default 1.6s cut off exports in
  progress on restart.

The vision worker is a second app in the same file, `avoidxray-vision`, running
`vision/worker.ts` under node with the tsx loader, with a third of the cores and a 3G memory
backstop. See [vision](vision.md).

On startup the server logs what it derived from the machine
(`src/lib/capacity.ts`):

```
[capacity] 6 cores, 8001MB total, 5 render slots, libvips concurrency 1
```

## Health

`GET /api/health` runs `SELECT 1` against the database and answers
`{"ok":true}`, or `{"ok":false}` with a 503 if the query fails or takes longer
than two seconds. It says nothing about why; the reason goes to the pm2 error
log. Use it for uptime checks and to wait for a restart to come up:

```bash
until curl -sf http://127.0.0.1:3000/api/health; do sleep 1; done
```

The vision worker has its own at `http://127.0.0.1:3210/health`, which reports
whether the models are loaded and how many photos are indexed.

## Deploying

A deploy pulls `main`, runs `npm install` (which runs `prisma generate`), applies
`prisma/migrations`, builds and restarts the site, then starts or restarts the
vision worker. The deploy script lives on the server, not in this repository.

- **`prebuild`** runs `scripts/clear-build-cache.mjs`, which clears stale build
  output but keeps the image cache. A CSS change once shipped without its
  stylesheet because the incremental cache handed the build an old chunk.
- **`postbuild`** runs `scripts/assert-client-bundle-clean.mjs`, failing the
  build if the database client reached the browser.
- Schema changes are migrations only. Committing one and deploying is enough;
  migrations are not run by hand against production.

## Continuous integration

`.github/workflows/schema.yml`, on every push to `main` and every pull request,
against PostgreSQL 14 to match production:

1. Lint and `npm test`.
2. Apply every migration to an empty database. This is the only place the
   baseline migration is ever exercised.
3. `prisma migrate diff --exit-code`: the migrations must reproduce
   `schema.prisma` exactly.
4. `prisma/tests/constraints.sql`: the CHECK constraints, triggers and indexes
   Prisma cannot see must exist and must refuse bad rows.
5. Database tests for the revision pipeline and the sign-in gate.
6. A production build.

## Tests

`scripts/test/` holds the test files, run with `tsx`. `npm test` runs
`scripts/test/run.mjs`, which runs every `*.test.ts(x)` in the folder except
the two that need a database (`authGate`, `revisionPipeline`; CI runs those
against a throwaway one). Each file runs in turn, all of them run even after a
failure, and the summary lists every file that failed. A new test file is
picked up without being registered anywhere. To run some of them:

```bash
node scripts/test/run.mjs capacity renderSlot
```

They cover logic where a wrong answer is quiet: feed scopes agreeing between
Prisma and raw SQL, rate limits, the URL parsers, who can see a photo while it
is screened, the word filter, EXIF stripping, the image pipeline and capacity
math, the render queue's ordering, duplicate detection, block filters, catalog
writes and field labels, export geometry and batching, the ZIP writer,
citation passage matching, and the route list. There is no browser suite, so
UI changes are checked by using them.

## Scheduled and maintenance work

| Job | What it does |
|---|---|
| `GET /api/upload/cleanup` | Hourly. Deletes drafts older than an hour. Requires `CRON_SECRET` in production |
| `scripts/prune-image-cache.mjs` | Keeps the image cache inside its disk budget (default 4000MB) |
| `scripts/backup-database.mjs` | Dumps the database, keeps 7 days locally and 30 in object storage, and verifies the uploads are not publicly readable |
| `/admin/maintenance` | Orphaned storage sweep, draft cleanup, orphaned record cleanup |
| `scripts/check-api-leaks.ts` | Calls every API route and fails on leaked fields |
| `scripts/backfill-*.ts` | One-off data fixes: slugs, photo sizes, cache headers, blurhash, film fields |

## Analytics

Self-hosted Umami on loopback. The tracker is served first-party from `/s.js`
and reports to `/_e` through nginx, which keeps it off blocklists and fast into
mainland China. Pageviews are sent manually so admin pages are excluded. The
admin panel reads reports back through Umami's API with a server-only key.

## Environment

See `.env.example`. Required: `DATABASE_URL`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL`.
Uploads need the `ALIYUN_OSS_*` variables, email needs `MAILTRAP_API_KEY`,
production cleanup needs `CRON_SECRET`, and analytics stays off unless the
`UMAMI_*` variables are set.

`LOCAL_UPLOADS=1` keeps uploads in `public/local-uploads` instead of the
bucket, so testing on localhost never writes to production storage. It is
ignored in production.

On startup the server logs `[env] MISSING ...` for any required variable that
is unset (in production: the database, NextAuth, the four `ALIYUN_OSS_*` and
`CRON_SECRET`). It does not refuse to start, so read the log after a deploy.

Optional, each with a working default:

| Variable | Default | What it does |
|---|---|---|
| `VISION_URL` | `http://127.0.0.1:3210` | Where the site reaches the vision worker |
| `VISION_PORT` | `3210` | The port the worker listens on, loopback only |
| `VISION_THREADS` | 2 (pm2 sets a third of the cores) | CPU threads for the worker's models and libvips |
| `VISION_MODEL_DIR` | `.vision-models` | Model cache, about 1GB, downloaded on first start |
| `RENDER_SLOTS` | cores - 1, at least 2 | Exports composited at once. pm2 reads it too, from the shell or `.env`, to size `UV_THREADPOOL_SIZE` |
| `SHARP_CONCURRENCY` | cores / render slots | libvips threads per render |
| `MEDIA_ROOT` | `/var/lib/avoidxray/media` | Local mirror of the bucket, read before fetching an export's source from Hong Kong |
| `POPULARITY_FILE` | `/var/lib/avoidxray/popularity.json` | The popularity report the admin panel reads |
| `POPULARITY_LOG` | `/www/wwwlogs/avoidxray_com.log` | The nginx access log the report is built from |

A bad `RENDER_SLOTS` or `SHARP_CONCURRENCY` (not a positive integer) is ignored
with a warning, and the derived value is used.

### Files outside the repository

- **The media mirror.** `/usr/local/bin/avoidxray-media-sync`, on the server
  and not in this repository, copies the bucket into `MEDIA_ROOT`. The export
  route reads a source from there first (`readMirrored` in
  `src/lib/watermark/serverPipeline.ts`): fetching an original from Hong Kong
  took 4 to 6 seconds against 0.74s to render it. Anything missing from the
  mirror, such as an upload since the last sync, falls through to the bucket,
  so a stale or absent mirror is slower, never wrong.
- **The popularity report.** `scripts/build-popularity.ts` reads the nginx
  access log, rotated generations included, ranks photos, films, cameras and
  profiles by distinct visitors, and writes `POPULARITY_FILE`. Run it on the
  server (`npx tsx scripts/build-popularity.ts`, or `--dry` to print only);
  about five seconds over a million lines, so nightly is cheap. Until it has
  run, the admin panel says the report has not been generated.
