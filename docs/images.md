# Images

Film scans are large. Uploads average about 8MB, the largest original on record
is 7956×7483 at around 50MB, and the server also runs other services. Most of
the decisions here come from fitting that into one process without running out
of memory.

## Upload

**In the browser** (`src/app/upload/page.tsx`, `src/lib/previewImage.ts`)

- Previews are downscaled to a 384px long edge, at most four decoding at once.
  Thirty 24MP scans decoded at full size would be about 2.7GB of bitmaps.
- HEIC files are previewed with `heic2any`, since browsers cannot draw them.
- Files go up one per request, in sequence. Anything over 100MB is refused
  before it is sent.
- Results are matched to tiles by preview URL, not index, because removing a
  tile shifts every index after it. A result for a tile that is gone deletes its
  draft.
- Upload and publish are separate steps with separate errors. When they shared
  one, retrying a failed publish re-sent photos that had already published.
- Leaving mid-upload is guarded by `beforeunload` for reloads and by a link
  interceptor for in-app navigation.

**On the server** (`src/app/api/upload/route.ts`), in order:

1. Rate limit, 6000 uploads per hour and 20000 per day per account, before the
   body is read. Sized for importing a whole library; storage and processing
   are bounded by the quota and the render slots, not by this.
2. A declared body over 108MB is refused. `formData()` buffers the whole body,
   and Next's `bodySizeLimit` covers only Server Actions.
3. At most 25 files per request, 100MB per file.
4. Each file is processed on its own, so one bad file does not fail the batch.
5. If the database insert fails after the files are stored, the stored files
   are deleted.

The photo row is created unpublished. Publishing is a separate `PATCH`, and
drafts older than an hour are removed by a cron (`/api/upload/cleanup`), which
deletes rows first and then only the files whose rows went. The other order
once left a published photo with no images.

## Originals and metadata

`src/lib/image.ts`:

- **The original is kept exactly as uploaded**, TIFF and HEIC included, and is
  always private. Only its owner is ever given it, through a signed address
  (`/api/photos/[id]/image/original`). Nothing in it is changed, so it keeps
  its GPS and serial numbers; that is why nobody else can read it.
- **Display versions carry no metadata but the sRGB profile.** sharp drops
  EXIF, XMP and IPTC unless told to keep them, and every version is told to
  keep nothing but `withIccProfile('srgb')`.
- **Format comes from the bytes**, never the uploaded name, and SVG is refused.
- **HEIC** is detected by extension or by its `ftyp` box. Dimensions are read
  from the header and anything over 50MP is refused before decoding, because
  libheif holds the whole frame at 4 bytes per pixel. It is decoded losslessly
  for the display versions; the stored original is the HEIC itself.

## Processing

`processImage` stores four files per photo, each under its own random key,
unrelated to the photo's id:

| File | Size | Format | Access |
|---|---|---|---|
| `originals/{random}.{ext}` | As uploaded | Byte for byte the uploaded file | Always private |
| `large/{random}.jpg` | 4000px long edge, never enlarged | JPEG q91, 4:4:4, progressive, the archive's settings | Public while published |
| `medium/{random}.webp` | 1600px long edge | WebP, quality 80 | Public while published |
| `thumbs/{random}.webp` | 800px long edge | WebP, quality 75 | Public while published |

- **Every version is made straight from the original**, each with its own
  decode, the EXIF orientation applied in the same pipeline. There is no
  intermediate copy to lose quality in.
- **sRGB is embedded in every version.** A tagged source is converted to
  sRGB; an untagged one, which is what lab scans are, is taken as sRGB.
- **Hashes are recorded at upload** (`src/lib/imageHash.ts`): the sha256 of
  the stored original; the sha256 of its image data alone (a JPEG from its
  first scan, a PNG's IDAT chunks), which survives metadata being rewritten;
  and a 64-bit difference hash of the thumb. The browser computes the first
  two the same way, from the same file.
- A blurhash, from the thumb. The versions are made one after the other:
  running them with `Promise.all` put several full-size decodes in flight.

## Who can read what

- A published photo's display versions are public files, served as stored.
  Pages never send photo files through the image optimizer
  (`src/lib/photoImage.ts`): it re-encodes at its own quality, drops the color
  profile, and keeps its copy under the photo's address for a year.
  `next.config.ts` allows it only catalog images, avatars and archive photos.
- A private photo's display versions are private files under new keys. Pages
  load them through `/api/photos/[id]/image/[variant]`, which checks the
  viewer and redirects to a signed address that stays the same for an hour, so
  the browser can cache it.
- **Making a photo private moves its files** (`src/lib/photoStorage.ts`):
  the row is hidden first, the files are copied to new private keys, the row
  is pointed at them, and the old files are deleted. Anyone holding an old
  address, or a copy cached under it, has nothing to fetch. A move that does
  not finish is retried by the hourly cleanup.
- Publishing makes the private keys readable first and points the row at
  them second. Those keys were never public.
- The lightbox and every full-size view show the large version, to everyone.
  The owner can also download the original.

**Limits are on pixels, not bytes** (`src/lib/sharpConfig.ts`). A 2MB PNG can
decode to 400 megapixels while a 50MB scan is modest, so the guard is
`MAX_INPUT_PIXELS = 150_000_000` (sharp's default of about 268MP is more than
the box survives), with libvips' cache capped at 32MB.

**Capacity is derived from the machine** (`src/lib/capacity.ts`). libvips gets
one thread per core and the render semaphore gets `max(2, cores - 1)` slots,
both overridable by environment variable. The values it replaced were written
for a 3-core, 2GB server and stayed in force through two upgrades.

## Archive photos

Public domain photographs imported from archives (`scripts/import-archive.ts`)
go through `processArchiveMaster` and `processArchiveFull` instead, under
`ARCHIVE_PROFILE` in `src/lib/image.ts`. The community settings above are
untouched by it.

| File | Size | Format |
|---|---|---|
| `archive/{source}/{id}-{sha}-v{n}-full.jpg` | The master's own size, never resized | JPEG q94 |
| `archive/{source}/{id}-{sha}-v{n}-largest.jpg` | 4000px long edge, never enlarged | JPEG q91 |
| `archive/{source}/{id}-{sha}-v{n}-medium.jpg` | 1600px long edge, never enlarged | JPEG q91 |
| `archive/{source}/{id}-{sha}-v{n}-thumb.webp` | 800px long edge | WebP, quality 75 |

Every JPEG uses the standard quantization tables with mozjpeg's trellis
quantization, progressive scans and 4:4:4 chroma.

- **No master is stored.** The master TIFF is downloaded to a temp file,
  checked, hashed, encoded and deleted. The record keeps its URL, size and
  sha256, and `--regenerate` downloads it again, refuses it if the hash
  differs, and remakes the versions.
- **A download is a master only if it is one.** The response must say
  `image/tiff`, be exactly as long as the HEAD request reported, and decode in
  full. Anything else, a CDN challenge page included, fails that item.
- **Every size comes straight from the master**, with Lanczos, so nothing is
  resized from an already compressed copy. No sharpening, levels, color
  changes or cropping.
- **sRGB is embedded in all four.** The masters are untagged 8-bit RGB, which
  is read as sRGB.
- **`v{n}` is the profile version.** Objects are immutable, so changing the
  profile means bumping it and writing new keys.
- **The photo page serves the JPEGs as stored.** The image optimizer
  re-encodes at quality 75, which would cap the page below what is stored.
  The page shows the medium; the lightbox moves to the largest, and to the
  full version only when the screen needs more pixels than the largest has.
  Grids serve the thumb as stored, as they do for every photo.
- The `archive/` prefix is outside the orphan sweep's sweepable list.
- **One photo per record, from the original scan.** Some records also hold
  copies of the same picture: copy negatives, copy transparencies, adjusted
  or later scans. Only the scan of the original slide or transparency in the
  collection's own digital id namespace is imported; a record without exactly
  one is skipped.
- **Subject headings are stored as the record gives them**, in order, from the
  item's `subject_headings`. Records imported before the column existed get
  theirs from `--subjects`, which reads only the item JSON at the JSON API's
  pace and fills in records whose headings are still empty.

### Running an import on a shared machine

The importer runs on the same machine as the live site, so it runs at the
lowest CPU and disk priority, with one libvips thread and no operation cache
(set in the script), and inside its own memory cap. If it outgrows the cap,
the kernel kills the importer, never the site. No swap, so it cannot page the
site out on its way there.

It runs from its own checkout, `/root/avx-archive-run`, never from the site's
directory: a site deploy rebuilds that directory, and an import running there
holds the deploy up. The checkout has its own `node_modules`, its own Prisma
client and a copy of the site's `.env` (mode 600). It does not follow site
deploys; when the import needs newer code, update it between runs:

```sh
cd /root/avx-archive-run
git fetch && git checkout --detach <deployed commit>
npm ci && npx prisma generate
```

Site deploys can change the production schema, so check before every start
that the checkout's schema matches the database, with `DATABASE_URL` from its
`.env`. Exit 0 means it matches; anything else means do not start, update the
checkout first:

```sh
npx prisma migrate diff --from-url "$DATABASE_URL" \
  --to-schema-datamodel prisma/schema.prisma --exit-code
```

The import runs as a transient systemd service rather than in a shell, so it
outlives the SSH session that started it:

```sh
systemd-run --unit avx-archive-import --collect \
  -p WorkingDirectory=/root/avx-archive-run \
  -p MemoryMax=2G -p MemorySwapMax=0 \
  -p Nice=19 -p IOSchedulingClass=best-effort -p IOSchedulingPriority=7 \
  -E MALLOC_ARENA_MAX=2 \
  /usr/bin/npx tsx scripts/import-archive.ts --limit 200
```

- `journalctl -u avx-archive-import -f` follows it; output goes to the journal.
- `systemctl show avx-archive-import -p MemoryCurrent -p Result` reports its
  memory while it runs and how it ended.
- `systemctl stop avx-archive-import` ends it early. A stopped or killed run
  leaves at most one temp dir, which the next run removes.
- Runs are resumable, so batches of `--limit 200` repeat until nothing is left.

`scripts/rollback-archive.ts` removes what an import added: rows first, then
files. It only prints what it would do unless given `--yes`.

## Storage

Aliyun OSS through the S3 client (`src/lib/oss.ts`), with three attempts, a 5s
connect timeout and a 120s request timeout. The SDK defaults have no timeout.

- **Keys never change.** Every object is written with
  `Cache-Control: public, max-age=31536000, immutable`, so replacing an image
  means a new key and a database update.
- **Only our own keys are accepted** from clients (`ownedOssKey` checks origin
  and prefix and refuses `..`).
- **Orphan sweep** (`/api/admin/oss-sync`) deletes objects nothing points at. It
  checks all five tables that hold keys (photos, avatars, cameras, film stocks,
  moderation submissions) and skips anything under an hour old, because uploads
  write files before rows. An earlier version read only photos and deleted
  every avatar and catalog image.

## The image cache

`/_next/image` is about 40% of all requests. The server is in Los Angeles and
the bucket in Hong Kong, so resizing from the local cache is two to three times
faster than a trip to storage, and an evicted entry costs about 1.3s.

- `minimumCacheTTL` is a year, since keys are content-addressed.
- `scripts/prune-image-cache.mjs` keeps the cache inside a 4000MB budget,
  evicting the least recently written entries.
- `scripts/clear-build-cache.mjs` runs before every build and keeps the image
  cache. The `rm -rf .next/cache` it replaced emptied it on every deploy.
- Blurhash placeholders are inlined only for the first 12 tiles of a grid. On
  `/films` they were 94% of the transfer.

## Exports

Readers can download a photo laid out as a print, filmstrip, negative, slide or
instant print, at social media sizes or as a sized print on paper. Rendering
is in `src/lib/watermark/render.ts`; the route is `/api/watermark`.

**Choosing the source.** The route uses the 1600px rendition unless the output
needs more, in which case it fetches the original. The rendition is 30 times
smaller and the bucket delivers 6 to 7MB/s. Sources are cached in memory (a
budget derived from total memory) and read from a local mirror before OSS.

**The render semaphore** (`withRenderSlot` in `serverPipeline.ts`):

- Each render takes a slot. A download over 24 megapixels counts as heavy and
  takes every slot, and light jobs wait behind a waiting heavy one.
- The queue holds 8. A full queue answers 503 with `Retry-After`.
- Batch exports yield to everything else.
- The source is fetched inside the slot, so queued requests do not each hold an
  original in memory.

Measured peaks: a full-size filmstrip about 560MB, a 61 to 64MP print about
1.2GB.

**Encoding speed.**

| Choice | Measured |
|---|---|
| libjpeg over mozjpeg | 1080² in 72ms vs 726ms; a 36-frame batch in 6s vs 145s, for 16% more bytes |
| Huffman optimization off | A 62MP print in 681ms vs 1902ms, for 3.9% more bytes |
| Halation blur on a quarter-size copy | 1482ms vs 7894ms, mean difference 0.20/255 |
| Raw pixels between stages instead of PNG | 29ms vs 402ms |

**What was cut.** The export dialog once offered seven looks and a resolution
grid. Across 895 logged exports the grid was touched 35 times, so it went, and
the looks went to five.

**Client side** (`src/components/ExportDialog.tsx`, `src/lib/exportBatch.ts`).
Previews debounce at 400ms and cancel when settings change. Batches run one
request per frame, up to 60 frames and 400MB, and stop on a 429 or 503 rather
than hammering a busy server. Archives are written by a small stored-ZIP writer
with ASCII names, since macOS ignores the UTF-8 flag.
