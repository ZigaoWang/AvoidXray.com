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
- **Cluster mode, exactly one worker.** The render semaphore, the source image
  cache and the rate limiter are in process memory, so a second worker would
  double every bound they enforce. Cluster mode is only for `pm2 reload`: it
  starts the new worker before stopping the old one, so a deploy drops no
  requests. For those few seconds there are two.
- **Runs from the deploy's `current` release** on the server
  (`AVOIDXRAY_WEB_DIR`, set by the deploy script), and from the checkout
  anywhere else. The vision and import workers and the cron jobs always run
  from the checkout.
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

```bash
git push origin main            # and check it landed
ssh bwh 'deploy avx <commit>'   # the commit origin/main is at
ssh bwh 'deploy avx rollback'   # back to the release before
```

The deploy script lives on the server, not in this repository.

- **It deploys only the commit named.** If `origin/main` is anywhere else it
  refuses and deploys nothing. A rejected push once went on to deploy anyway,
  shipping origin as it was without the change.
- **Checkout first.** It fast-forwards the checkout to that commit, runs
  `npm install` (which runs `prisma generate`), takes a database backup and
  applies `prisma/migrations`.
- **Then a release.** The commit is built in a directory of its own while the
  current release keeps serving: the commit's files from git, the checkout's
  `node_modules` (hard-linked where unchanged from the previous release), and
  the checkout's `.env` and image optimizer cache, linked.
- **Proved before it serves.** The release is started once on a spare port and
  must answer its home page and `/api/health`, or nothing is switched.
- **Switched in one step.** The `current` symlink is renamed onto the new
  release and pm2 reloads the site, which starts the new worker before stopping
  the old. If the reloaded site does not serve, it switches back by itself.
  The vision and import workers then restart from the checkout.
- **The previous release stays**, with its static chunks merged into the new
  one so open tabs keep loading. `deploy avx rollback` switches back to it in
  seconds. The database, the checkout and the workers stay on the newer
  commit, which is safe because migrations are additive. Three releases are
  kept.

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
the ones that need a database (`archiveVisibility`, `authGate`, `photoPrivacy`,
`revisionPipeline`; CI runs those against a throwaway one) and
`privateStorage`, which also writes to the real bucket and is run by hand
before any change to how photo files are stored or served. Each file runs in turn, all of them run even after a
failure, and the summary lists every file that failed. A new test file is
picked up without being registered anywhere. To run some of them:

```bash
node scripts/test/run.mjs capacity renderSlot
```

They cover logic where a wrong answer is quiet: feed scopes agreeing between
Prisma and raw SQL, rate limits, the URL parsers, who can see a photo while it
is screened, the word filter, the display versions and file hashes, the image pipeline and capacity
math, the render queue's ordering, duplicate detection, block filters, catalog
writes and field labels, export geometry and batching, the ZIP writer,
citation passage matching, and the route list. There is no browser suite, so
UI changes are checked by using them.

## Scheduled and maintenance work

| Job | What it does |
|---|---|
| `GET /api/upload/cleanup` | Hourly. Deletes drafts older than an hour, and finishes any photo file moves a visibility change left undone. Requires `CRON_SECRET` in production |
| `scripts/prune-image-cache.mjs` | Keeps the image cache inside its disk budget (default 4000MB) |
| `scripts/backup-database.mjs` | Dumps the database, keeps 7 days locally and 30 in object storage, and verifies the uploads are not publicly readable |
| `/admin/maintenance` | Orphaned storage sweep, draft cleanup, orphaned record cleanup |
| `scripts/check-api-leaks.ts` | Calls every API route and fails on leaked fields |
| `scripts/backfill-*.ts` | One-off data fixes: slugs, photo sizes, cache headers, blurhash, film fields, rolls, photo files |
| `scripts/privatize-originals.ts` | One-off: makes every original private and drops the optimizer's copies of them |

### Making originals private

Originals used to be public files. Moving existing photos to private originals
has to happen in this order, so no page is ever left pointing at a file it can
no longer read:

1. Deploy the code that serves display versions only. From then on new
   uploads store a private original, and every page shows the large or medium
   version; the optimizer refuses photo files.
2. `scripts/backfill-photo-files.ts`, run like the archive import (see
   docs/images.md), gives every existing photo a large version made from its
   original, sRGB-tagged display versions under new keys, and its hashes. Pages
   keep working throughout, since each row moves to its new files in one write.
3. `scripts/test/privateStorage.test.ts`, then
   `scripts/privatize-originals.ts --cache-dir .next/cache/images`, without
   `--yes` first. It refuses while any photo lacks a large version. With
   `--yes` it makes each original private and removes the optimizer's cached
   copies of it.
4. An hour later, the orphan sweep in `/admin/maintenance` removes the display
   versions step 2 replaced.

#### Then the bucket's own default

The bucket is public-read, so an object written without an ACL of its own is
public. Originals are written private on purpose, but a missing ACL anywhere
fails open. Switching the bucket to private makes it fail closed, and has to
come after every object a public page loads says public-read for itself,
or those pages lose their images:

5. Deploy the code that states an ACL on every write. Today avatars, camera and
   film stock images, moderation images (approved ones become the catalog
   image) and archive versions take the bucket default; they say public-read
   instead, and `ObjectAccess` loses `inherit`.
6. A script, dry run first, that sets public-read on every object a public page
   references: display versions of photos whose files are public, every
   archive version, avatars, and the camera, film stock and moderation images
   the database names. It then reads each one's ACL back and lists any that is
   still the default. Display versions of private photos, originals and
   backups are left as they are.
7. Set the bucket ACL to private. Straight after, request without credentials
   one object of each kind (thumb, medium, large, archive, avatar, camera,
   film stock, moderation image, original, backup) and open the home page, a
   photo, an archive photo, a camera, a film and a profile. Undoing it is one
   call: set the bucket back to public-read.
8. Turn on the nightly originals check (below).

Objects nobody references stay at the default and so become private, which
breaks nothing; the orphan sweep deletes them. The media mirror reads with
credentials and is unaffected.

#### Nightly originals check

`/usr/local/bin/avoidxray-originals-check`, on the server, lists everything
under `originals/` with the bucket credentials and requests each object
without them. Any answer but 403 fails the run, and its systemd unit's failure
hook sends the same alert as the media mirror. Until step 3 has run every
original is still public, so the timer is only enabled at step 8.

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
  so a stale or absent mirror is slower, never wrong. It lists photos by their
  key columns and signs its reads with the app's bucket credentials from the
  app's `.env`, since originals and private photos' files refuse anonymous
  reads. Archive files are left out, since they can be made again from the
  Library of Congress masters. `avoidxray-media-sync KEY...` mirrors just
  those keys. It is run by hand, not on a schedule.
- **The popularity report.** `scripts/build-popularity.ts` reads the nginx
  access log, rotated generations included, ranks photos, films, cameras and
  profiles by distinct visitors, and writes `POPULARITY_FILE`. Run it on the
  server (`npx tsx scripts/build-popularity.ts`, or `--dry` to print only);
  about five seconds over a million lines, so nightly is cheap. Until it has
  run, the admin panel says the report has not been generated.
