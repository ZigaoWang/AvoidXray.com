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

1. Rate limit, 300 uploads per hour per account, before the body is read.
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

## Location and HEIC

`src/lib/image.ts`:

- **Personal metadata is removed.** `stripPrivateMetadata` (with
  `src/lib/stripMetadata.ts`) rewrites JPEG and PNG without re-encoding. It
  drops GPS, serial numbers, owner, Artist and Copyright, the computer name,
  the embedded preview, MakerNote, XMP, IPTC and PNG text chunks. Make, model,
  exposure, date and orientation stay. A file with none of those is stored
  byte for byte. Other formats are re-encoded if they carry any metadata, and
  metadata that cannot be parsed counts as present.
- **HEIC** is detected by extension or by its `ftyp` box. Dimensions are read
  from the header and anything over 50MP is refused before decoding, because
  libheif holds the whole frame at 4 bytes per pixel. Conversion goes through
  sharp: `heic-convert`'s PNG encoder is synchronous and stalled the server.

## Processing

`processImage` produces three files per photo:

| File | Size | Format |
|---|---|---|
| `originals/{uuid}.{ext}` | As uploaded | Same pixels, personal metadata removed |
| `medium/{uuid}.webp` | 1600px long edge | WebP, quality 80 |
| `thumbs/{uuid}.webp` | 800px long edge | WebP, quality 75 |

Plus a blurhash from a 32×32 resize. The two renditions are made one after the
other: running them with `Promise.all` put two full-size decodes in flight and
doubled the peak.

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
go through `processArchiveMaster` instead, under `ARCHIVE_PROFILE` in
`src/lib/image.ts`. The community settings above are untouched by it.

| File | Size | Format |
|---|---|---|
| `archive/{source}/{id}-{sha}-v{n}-largest.jpg` | 4000px long edge, never enlarged | JPEG q91 (standard tables), mozjpeg trellis, progressive, 4:4:4 |
| `archive/{source}/{id}-{sha}-v{n}-medium.webp` | 1600px long edge | WebP, quality 80 |
| `archive/{source}/{id}-{sha}-v{n}-thumb.webp` | 800px long edge | WebP, quality 75 |

- **No original is stored.** The master TIFF is downloaded to a temp file,
  hashed, resized and deleted. The record keeps its URL, size and sha256, and
  `--regenerate` downloads it again, refuses it if the hash differs, and
  remakes the versions. The page links to the archive for the full original.
- **Every size comes straight from the master**, with Lanczos, so nothing is
  resized from an already compressed copy. No sharpening, levels, color
  changes or cropping.
- **sRGB is embedded in all three.** The masters are untagged 8-bit RGB, which
  is read as sRGB.
- **`v{n}` is the profile version.** Objects are immutable, so changing the
  profile means bumping it and writing new keys.
- The `archive/` prefix is outside the orphan sweep's sweepable list.

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
