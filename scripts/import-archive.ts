/**
 * Imports public domain photographs from an archive as ARCHIVE photos.
 *
 * One item at a time: fetch the record, download the master TIFF to a temp
 * file while hashing it, make the display versions from that file, upload
 * them, write the rows, delete the file. Masters are never stored, and never
 * more than one is on disk, so the collection is never staged locally. The
 * record keeps the master's URL, size and sha256, so --regenerate can fetch it
 * again, prove it is the same file, and remake the display versions.
 *
 *   npx tsx scripts/import-archive.ts --dry-run             # metadata only, writes nothing
 *   npx tsx scripts/import-archive.ts --limit 20            # import the first 20 new items
 *   npx tsx scripts/import-archive.ts --regenerate --limit 5
 *   npx tsx scripts/import-archive.ts --dry-run --report out.json
 *   npx tsx scripts/import-archive.ts --ids 2017878934,2017877351   # only these items
 *
 * Resumable: an item already imported for this source is skipped, since its
 * rows are written only once its files are stored. LOC answers fast clients
 * with 403, so requests are spaced per host and retried with backoff.
 *
 * On a machine shared with the live site, run it inside a memory cap; the
 * command and its reasons are in docs/images.md.
 */

import 'dotenv/config'
import { createHash } from 'node:crypto'
import { createWriteStream } from 'node:fs'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { Readable, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { PrismaClient } from '@prisma/client'
import sharp from 'sharp'
import { processArchiveFull, processArchiveMaster, type ArchiveVersion } from '../src/lib/image'
import { SHARP_INPUT } from '../src/lib/sharpConfig'
import { masterContentTypeProblem, masterSizeProblem } from '../src/lib/archive/master'
import { deleteFromOSS } from '../src/lib/oss'
import { extractKeyFromUrl } from '../src/lib/ossUtils'
import {
  creditLineFromRights,
  publicDomainStatement,
  itemFromCollectionResult,
  readLocItem,
  type LocCollectionResult,
  type LocItemJson,
  type LocRecord,
} from '../src/lib/archive/loc'

/** Sources this script knows how to read. The slug is also the storage prefix. */
const SOURCES = {
  'fsa-owi-color': {
    collectionUrl: 'https://www.loc.gov/collections/fsa-owi-color-photographs/',
  },
} as const
type SourceSlug = keyof typeof SOURCES

const USER_AGENT = 'AvoidXray archive importer (+https://avoidxray.com; zigao.wang24@gmail.com)'

/**
 * Milliseconds between requests to one host, under LOC's published limits
 * (loc.gov/apis/json-and-yaml/working-within-limits): 20 a minute for the
 * JSON API on www, 150 a minute for files on /storage-services/. Going over
 * either blocks the address for an hour.
 */
const SPACING: Record<string, number> = { 'www.loc.gov': 3500, 'tile.loc.gov': 500 }
const DEFAULT_SPACING = 3500
/** How long a 429 pauses every request to that host: LOC blocks for an hour. */
const RATE_LIMITED_PAUSE_MS = 15 * 60 * 1000
const MAX_ATTEMPTS = 6
/**
 * Items a dry run examines at once. Each request still waits for its host's
 * slot above, so this only stops one slow response from holding up the next;
 * it does not raise the rate past the spacing. The import itself handles one
 * item at a time.
 */
const DRY_RUN_WORKERS = 3
const PAGE_SIZE = 100

function parseArgs(argv: string[]) {
  const value = (flag: string) => {
    const i = argv.indexOf(flag)
    return i >= 0 ? argv[i + 1] : undefined
  }
  const limit = value('--limit')
  const source = (value('--source') ?? 'fsa-owi-color') as SourceSlug
  if (!(source in SOURCES)) throw new Error(`Unknown source ${source}`)
  if (limit !== undefined && !(Number(limit) > 0)) throw new Error('--limit takes a positive number')
  const ids = value('--ids')?.split(',').map(id => id.trim()).filter(Boolean)
  if (ids && ids.length === 0) throw new Error('--ids takes a comma-separated list of item ids')
  return {
    dryRun: argv.includes('--dry-run'),
    regenerate: argv.includes('--regenerate'),
    limit: limit === undefined ? Infinity : Number(limit),
    report: value('--report'),
    ids: ids ? new Set(ids) : null,
    source,
  }
}

// --- HTTP -------------------------------------------------------------------

const lastRequestAt = new Map<string, number>()

/**
 * Waits for this host's next slot. The slot is claimed before waiting, so
 * concurrent callers queue behind each other instead of all reading the same
 * last request time and going at once.
 */
async function spaced(url: string) {
  const host = new URL(url).host
  const gap = SPACING[host] ?? DEFAULT_SPACING
  const slot = Math.max(Date.now(), (lastRequestAt.get(host) ?? 0) + gap)
  lastRequestAt.set(host, slot)
  const wait = slot - Date.now()
  if (wait > 0) await new Promise(resolve => setTimeout(resolve, wait))
}

/** A status worth asking again for: LOC answers fast clients with 403. */
class RetryableStatus extends Error {
  constructor(readonly status: number, readonly retryAfterMs: number | null) {
    super(`HTTP ${status}`)
  }
}

/**
 * Fetches `url` and hands the response to `read`, spaced per host. A
 * retryable status, a network error or a failure partway through reading the
 * body starts the whole request again, with exponential backoff; LOC's servers
 * reset long transfers often enough that a body read has to be covered too.
 */
async function withRetry<T>(url: string, init: RequestInit, read: (response: Response) => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    await spaced(url)
    try {
      const response = await fetch(url, { ...init, headers: { 'User-Agent': USER_AGENT, ...init.headers } })
      if (response.status === 403 || response.status === 429 || response.status >= 500) {
        await response.body?.cancel().catch(() => {})
        const retryAfter = Number(response.headers.get('retry-after'))
        throw new RetryableStatus(response.status, retryAfter > 0 ? retryAfter * 1000 : null)
      }
      return await read(response)
    } catch (error) {
      if (error instanceof FinalError || attempt === MAX_ATTEMPTS) throw error
      let backoff = (error instanceof RetryableStatus && error.retryAfterMs) || 2000 * 2 ** (attempt - 1)
      if (error instanceof RetryableStatus && error.status === 429) {
        // Rate limited: every request to the host waits, not just this one,
        // or the other workers keep the block going.
        backoff = error.retryAfterMs ?? RATE_LIMITED_PAUSE_MS
        const host = new URL(url).host
        lastRequestAt.set(host, Math.max(lastRequestAt.get(host) ?? 0, Date.now() + backoff))
      }
      console.warn(`  ${error instanceof Error ? error.message : String(error)} for ${url}; retrying in ${backoff / 1000}s`)
      await new Promise(resolve => setTimeout(resolve, backoff))
    }
  }
}

/** A failure asking again will not fix, such as a 404. */
class FinalError extends Error {}

async function getJson<T>(url: string): Promise<T> {
  return withRetry(url, {}, async response => {
    if (!response.ok) throw new FinalError(`HTTP ${response.status} for ${url}`)
    return (await response.json()) as T
  })
}

/** The master's size, from a HEAD request. Null when it is not there. */
async function headBytesOf(url: string): Promise<number | null> {
  return withRetry(url, { method: 'HEAD' }, async response => {
    if (!response.ok) return null
    const length = Number(response.headers.get('content-length'))
    return Number.isFinite(length) && length > 0 ? length : null
  })
}

/**
 * Streams `url` into `file`, hashing on the way. A retry starts the file over.
 *
 * Refuses anything but a TIFF exactly `headBytes` long: a CDN challenge page
 * comes back as an ordinary response, and saved unchecked it would be hashed
 * and recorded as the master. A body cut short against its own
 * content-length is retried; one that disagrees with the HEAD request is not.
 */
async function download(url: string, file: string, headBytes: number): Promise<{ bytes: number; sha256: string }> {
  return withRetry(url, {}, async response => {
    if (!response.ok || !response.body) throw new FinalError(`HTTP ${response.status} downloading ${url}`)
    const typeProblem = masterContentTypeProblem(response.headers.get('content-type'))
    if (typeProblem) {
      await response.body.cancel().catch(() => {})
      throw new FinalError(`${typeProblem} at ${url}`)
    }
    const hash = createHash('sha256')
    let bytes = 0
    await pipeline(
      Readable.fromWeb(response.body as never),
      new Transform({
        transform(chunk: Buffer, _encoding, done) {
          hash.update(chunk)
          bytes += chunk.length
          done(null, chunk)
        },
      }),
      createWriteStream(file)
    )
    const expected = Number(response.headers.get('content-length'))
    if (Number.isFinite(expected) && expected > 0 && expected !== bytes) {
      throw new Error(`Download of ${url} stopped at ${bytes} of ${expected} bytes`)
    }
    const sizeProblem = masterSizeProblem(bytes, headBytes)
    if (sizeProblem) throw new FinalError(`${sizeProblem} for ${url}`)
    return { bytes, sha256: hash.digest('hex') }
  })
}

/**
 * Decodes the whole master once before anything is made from it, so a file
 * that is not an image, or is damaged partway, fails here with nothing stored.
 */
async function checkDecodes(file: string) {
  const { format } = await sharp(file, SHARP_INPUT).metadata()
  if (format !== 'tiff') throw new Error(`The master decodes as ${format ?? 'nothing'}, not TIFF`)
  await sharp(file, { ...SHARP_INPUT, failOn: 'warning' }).stats()
}

// --- Collection -------------------------------------------------------------

interface CollectionPage {
  title?: string
  results: Array<LocCollectionResult & { url?: string }>
  /** `of` is the item count; `total` is the number of pages. */
  pagination: { next: string | null; of: number }
}

/** Every item in the collection, in the collection's own order, with its listing entry. */
async function listItems(collectionUrl: string): Promise<{ title: string | null; items: string[]; listed: Map<string, LocItemJson> }> {
  const items: string[] = []
  const listed = new Map<string, LocItemJson>()
  let title: string | null = null
  for (let page = 1; ; page++) {
    const json = await getJson<CollectionPage>(`${collectionUrl}?fo=json&c=${PAGE_SIZE}&sp=${page}`)
    title ??= json.title ?? null
    for (const result of json.results) {
      const url = (result.id ?? result.url ?? '').replace(/^http:/, 'https:')
      if (!/\/item\/[^/]+\/$/.test(url)) continue
      items.push(url)
      listed.set(url, itemFromCollectionResult(result))
    }
    console.log(`  page ${page}: ${items.length} of ${json.pagination.of}`)
    if (!json.pagination.next) break
  }
  return { title, items: [...new Set(items)], listed }
}

// --- Import -----------------------------------------------------------------

const prisma = new PrismaClient()

/** The source row, created from the collection and one item's rights statement on first use. */
async function ensureSource(slug: SourceSlug, collectionTitle: string | null, sample: LocItemJson) {
  const existing = await prisma.archiveSource.findUnique({ where: { slug } })
  if (existing) return existing
  const creditLine = creditLineFromRights(sample.item?.rights)
  const license = publicDomainStatement(sample.item?.rights)
  if (!collectionTitle || !creditLine || !license) {
    throw new Error('Could not read the collection title, credit line and license from LOC')
  }
  return prisma.archiveSource.create({
    data: { slug, name: collectionTitle, homepageUrl: SOURCES[slug].collectionUrl, license, creditLine },
  })
}

interface Imported {
  externalId: string
  masterUrl: string
  title: string | null
  photographer: string | null
  masterBytes: number
  masterSha256: string
  masterWidth: number
  masterHeight: number
  photoId: string
  versions: Record<'full' | 'largest' | 'medium' | 'thumb', ArchiveVersion>
  /** Seconds spent making the display versions, and the full version. */
  seconds: { display: number; full: number }
}

type Processed = Awaited<ReturnType<typeof processArchiveMaster>> & { full: ArchiveVersion; seconds: Imported['seconds'] }

/**
 * Downloads a master, makes and stores its versions, and hands them to `save`.
 * The temp file is removed whatever happens, and stored files are removed
 * again if anything after them fails, so a failed item leaves nothing behind.
 */
async function withVersions<T>(
  slug: SourceSlug,
  record: Pick<LocRecord, 'externalId' | 'sourceMasterUrl'>,
  master: { headBytes: number; expectedSha256: string | null },
  save: (downloaded: { bytes: number; sha256: string }, processed: Processed) => Promise<T>
): Promise<T> {
  const dir = await mkdtemp(path.join(tmpdir(), 'avx-archive-'))
  const file = path.join(dir, 'master.tif')
  const stored: string[] = []
  try {
    const downloaded = await download(record.sourceMasterUrl, file, master.headBytes)
    if (master.expectedSha256 && downloaded.sha256 !== master.expectedSha256) {
      throw new Error(`Master changed since import: sha256 ${downloaded.sha256}, recorded ${master.expectedSha256}`)
    }
    await checkDecodes(file)
    const keyPrefix = `archive/${slug}/${record.externalId}-${downloaded.sha256.slice(0, 12)}`
    const started = Date.now()
    const display = await processArchiveMaster(file, keyPrefix)
    stored.push(display.largest.key, display.medium.key, display.thumb.key)
    const displayDone = Date.now()
    const full = await processArchiveFull(file, keyPrefix)
    stored.push(full.key)
    const seconds = { display: (displayDone - started) / 1000, full: (Date.now() - displayDone) / 1000 }
    return await save(downloaded, { ...display, full, seconds })
  } catch (error) {
    await Promise.all(stored.map(key => deleteFromOSS(key).catch(() => {})))
    throw error
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

/** The ArchiveRecord columns for a full version. */
const fullColumns = (full: ArchiveVersion) => ({
  fullPath: full.url,
  fullWidth: full.width,
  fullHeight: full.height,
  fullBytes: full.bytes,
})

async function importRecord(slug: SourceSlug, sourceId: string, record: LocRecord, headBytes: number): Promise<Imported> {
  return withVersions(slug, record, { headBytes, expectedSha256: null }, async (master, processed) => {
    const photo = await prisma.photo.create({
      data: {
        kind: 'ARCHIVE',
        originalPath: processed.largest.url,
        mediumPath: processed.medium.url,
        thumbnailPath: processed.thumb.url,
        width: processed.largest.width,
        height: processed.largest.height,
        originalBytes: processed.largest.bytes,
        blurHash: processed.blurHash,
        published: true,
        visibility: 'PUBLIC',
        // Nothing to screen: these were published by the archive.
        screening: 'CLEAR',
        archiveRecord: {
          create: {
            sourceId,
            externalId: record.externalId,
            sourceUrl: record.sourceUrl,
            sourceHandleUrl: record.sourceHandleUrl,
            sourceMasterUrl: record.sourceMasterUrl,
            sourceMasterBytes: BigInt(master.bytes),
            sourceMasterSha256: master.sha256,
            photographer: record.photographer,
            takenAt: record.takenAt,
            originalTitle: record.originalTitle,
            medium: record.medium,
            notes: record.notes,
            rightsNote: record.rightsNote,
            ...fullColumns(processed.full),
          },
        },
      },
    })
    return summarize(record.externalId, record.sourceMasterUrl, record.originalTitle, record.photographer, photo.id, master, processed)
  })
}

/** Remakes an imported photo's display versions from its master, after checking the master is unchanged. */
async function regenerate(slug: SourceSlug, photoId: string) {
  const photo = await prisma.photo.findUniqueOrThrow({ where: { id: photoId }, include: { archiveRecord: true } })
  const record = photo.archiveRecord
  if (!record) throw new Error(`Photo ${photoId} has no archive record`)
  const previous = [photo.originalPath, photo.mediumPath, photo.thumbnailPath, record.fullPath]
  const headBytes = await headBytesOf(record.sourceMasterUrl)
  if (!headBytes) throw new Error(`No master at ${record.sourceMasterUrl}`)
  const result = await withVersions(slug, record, { headBytes, expectedSha256: record.sourceMasterSha256 }, async (master, processed) => {
    await prisma.photo.update({
      where: { id: photoId },
      data: {
        archiveRecord: { update: fullColumns(processed.full) },
        originalPath: processed.largest.url,
        mediumPath: processed.medium.url,
        thumbnailPath: processed.thumb.url,
        width: processed.largest.width,
        height: processed.largest.height,
        originalBytes: processed.largest.bytes,
        blurHash: processed.blurHash,
      },
    })
    return summarize(record.externalId, record.sourceMasterUrl, record.originalTitle, record.photographer, photoId, master, processed)
  })
  // Keys carry the profile version, so a changed profile writes new objects
  // and the old ones go once the row points away from them.
  const current = new Set(Object.values(result.versions).map(v => v.url))
  for (const url of previous) {
    const key = !url || current.has(url) ? null : extractKeyFromUrl(url)
    if (key) await deleteFromOSS(key).catch(() => {})
  }
  return result
}

function summarize(
  externalId: string,
  masterUrl: string,
  title: string | null,
  photographer: string | null,
  photoId: string,
  master: { bytes: number; sha256: string },
  processed: Processed
): Imported {
  return {
    externalId,
    masterUrl,
    title,
    photographer,
    masterBytes: master.bytes,
    masterSha256: master.sha256,
    masterWidth: processed.masterWidth,
    masterHeight: processed.masterHeight,
    photoId,
    versions: { full: processed.full, largest: processed.largest, medium: processed.medium, thumb: processed.thumb },
    seconds: processed.seconds,
  }
}

const mb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`

/** One line about an imported item's master and versions. */
function describe(result: Imported) {
  const v = result.versions
  const size = (version: ArchiveVersion) => `${version.width}x${version.height} ${mb(version.bytes)}`
  return (
    `master ${mb(result.masterBytes)} ${result.masterWidth}x${result.masterHeight} -> full ${size(v.full)}, ` +
    `largest ${size(v.largest)}, medium ${size(v.medium)}, thumb ${size(v.thumb)}; ` +
    `encoded in ${result.seconds.display.toFixed(1)}s + ${result.seconds.full.toFixed(1)}s full`
  )
}

// --- Main -------------------------------------------------------------------

async function main() {
  const args = parseArgs(process.argv.slice(2))
  // One libvips thread and no operation cache: this shares a machine with the
  // live site, and the encodes are not urgent.
  sharp.concurrency(1)
  sharp.cache(false)
  const { collectionUrl } = SOURCES[args.source]
  console.log(`${args.dryRun ? 'Dry run' : args.regenerate ? 'Regenerate' : 'Import'}: ${args.source}`)

  if (args.regenerate) {
    const records = await prisma.archiveRecord.findMany({
      where: { source: { slug: args.source } },
      orderBy: { createdAt: 'asc' },
      take: Number.isFinite(args.limit) ? args.limit : undefined,
      select: { photoId: true, externalId: true },
    })
    for (const r of records) {
      const result = await regenerate(args.source, r.photoId)
      console.log(`  regenerated ${r.externalId}: sha256 verified, ${describe(result)}`)
    }
    return
  }

  // Read so a dry run can say what is new. A database that predates the
  // archive tables answers nothing, which a dry run can live with.
  let imported = new Set<string>()
  try {
    const rows = await prisma.archiveRecord.findMany({
      where: { source: { slug: args.source } },
      select: { externalId: true },
    })
    imported = new Set(rows.map(r => r.externalId))
  } catch (error) {
    if (!args.dryRun) throw error
    console.warn('  could not read existing archive records; treating none as imported')
  }

  console.log('Listing the collection')
  const { title, items: listedItems, listed } = await listItems(collectionUrl)
  const itemId = (url: string) => url.match(/\/item\/([^/]+)\/$/)?.[1]
  const items = args.ids ? listedItems.filter(url => args.ids!.has(itemId(url) ?? '')) : listedItems
  if (args.ids) {
    const missing = [...args.ids].filter(id => !items.some(url => itemId(url) === id))
    if (missing.length) console.warn(`  not in the collection: ${missing.join(', ')}`)
  }

  const importable: Array<LocRecord & { masterBytes: number }> = []
  const skipped: Array<{ url: string; externalId: string | null; reason: string }> = []
  const mediums = new Map<string, number>()
  const done: Imported[] = []
  const failed: Array<{ externalId: string; error: string }> = []
  let alreadyImported = 0
  let sourceId: string | null = null

  type Examined =
    | { type: 'skip' }
    | { type: 'already' }
    | { type: 'importable'; record: LocRecord; json: LocItemJson; masterBytes: number }

  /**
   * Reads one item's record and checks its master, without downloading it.
   * A dry run reads the record from the collection listing, which carries the
   * same fields, rather than spending the JSON API's 20 requests a minute on
   * every item page; the import reads the item page itself.
   */
  async function examine(url: string, index: number): Promise<Examined> {
    const label = `  [${index + 1}/${items.length}]`
    let json: LocItemJson
    try {
      json = args.dryRun && listed.has(url) ? listed.get(url)! : await getJson<LocItemJson>(`${url}?fo=json`)
    } catch (error) {
      skipped.push({ url, externalId: null, reason: `could not fetch the record: ${error instanceof Error ? error.message : error}` })
      console.log(`${label} skip ${url}: could not fetch the record`)
      return { type: 'skip' }
    }
    const medium = (json.item?.medium ?? []).join('; ') || '(none)'
    mediums.set(medium, (mediums.get(medium) ?? 0) + 1)

    const reading = readLocItem(json)
    if (!reading.ok) {
      skipped.push({ url, externalId: reading.externalId, reason: reading.reason })
      console.log(`${label} skip ${reading.externalId ?? url}: ${reading.reason}`)
      return { type: 'skip' }
    }
    const { record } = reading
    if (imported.has(record.externalId)) {
      alreadyImported++
      return { type: 'already' }
    }

    const masterBytes = await headBytesOf(record.sourceMasterUrl).catch(() => null)
    if (!masterBytes) {
      skipped.push({ url, externalId: record.externalId, reason: `no master at ${record.sourceMasterUrl}` })
      console.log(`${label} skip ${record.externalId}: no master TIFF`)
      return { type: 'skip' }
    }
    importable.push({ ...record, masterBytes })
    if (args.dryRun) {
      console.log(`${label} would import ${record.externalId} (${mb(masterBytes)}): ${record.originalTitle?.slice(0, 70)}`)
    }
    return { type: 'importable', record, json, masterBytes }
  }

  if (args.dryRun) {
    let cursor = 0
    const worker = async () => {
      while (cursor < items.length) {
        const index = cursor++
        await examine(items[index], index)
      }
    }
    await Promise.all(Array.from({ length: DRY_RUN_WORKERS }, worker))
  } else {
    for (const [index, url] of items.entries()) {
      if (done.length >= args.limit) break
      const examined = await examine(url, index)
      if (examined.type !== 'importable') continue
      const { record, json, masterBytes } = examined

      sourceId ??= (await ensureSource(args.source, title, json)).id
      try {
        const result = await importRecord(args.source, sourceId, record, masterBytes)
        done.push(result)
        console.log(`  [${done.length}/${Math.min(args.limit, items.length)}] imported ${record.externalId}: ${describe(result)}`)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        failed.push({ externalId: record.externalId, error: message })
        console.error(`  failed ${record.externalId}: ${message}`)
      }
    }
  }

  const totalMasterBytes = importable.reduce((sum, r) => sum + r.masterBytes, 0)
  const reasons = new Map<string, number>()
  for (const s of skipped) {
    const key = s.reason.replace(/https?:\/\/\S+/g, '<url>')
    reasons.set(key, (reasons.get(key) ?? 0) + 1)
  }

  console.log('\nSummary')
  console.log(`  items in collection: ${items.length}`)
  if (alreadyImported) console.log(`  already imported: ${alreadyImported}`)
  console.log(`  ${args.dryRun ? 'importable' : 'examined and importable'}: ${importable.length}`)
  console.log(`  skipped: ${skipped.length}`)
  for (const [reason, count] of [...reasons].sort((a, b) => b[1] - a[1])) console.log(`    ${count}  ${reason}`)
  console.log(`  total master bytes: ${totalMasterBytes} (${(totalMasterBytes / 1024 ** 3).toFixed(2)} GiB)`)
  if (!args.dryRun) console.log(`  imported: ${done.length}, failed: ${failed.length}`)
  if (args.dryRun) {
    console.log('  medium values:')
    for (const [medium, count] of [...mediums].sort((a, b) => b[1] - a[1])) console.log(`    ${count}  ${medium}`)
  }

  if (args.report) {
    await writeFile(
      args.report,
      JSON.stringify(
        {
          source: args.source,
          dryRun: args.dryRun,
          items: items.length,
          alreadyImported,
          importable: importable.length,
          totalMasterBytes,
          skipped,
          mediums: Object.fromEntries([...mediums].sort((a, b) => b[1] - a[1])),
          imported: done,
          failed,
        },
        null,
        2
      )
    )
    console.log(`  report written to ${args.report}`)
  }
}

main()
  .catch(error => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
