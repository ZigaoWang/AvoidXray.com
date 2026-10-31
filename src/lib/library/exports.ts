import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { ARCHIVE_CEILING_BYTES, MAX_BATCH } from '@/lib/exportBatch'
import { displayName } from '@/lib/seo/alt'
import { SITE_URL } from '@/lib/seo/site'
import { safeName, safePart, uniqueNames } from '@/lib/zip'
import { LIBRARY_EXPORT_DAYS } from './exportRules'
import { formatRollDate } from './rollFields'

/**
 * Export of original files: a roll, an album, a selection or the whole
 * library, as the files exactly as uploaded, one folder per roll, with the
 * photos' details beside them in photos.csv and photos.json.
 *
 * A small export is zipped in the browser, which fetches the originals
 * through signed addresses. Anything larger is queued as a LibraryExport and
 * built by scripts/export-worker.ts (exportBuild.ts) in parts stored privately
 * under exports/, which the owner downloads through the site for EXPORT_DAYS.
 *
 * Only the owner's own photos are ever exported: an album can hold other
 * people's photos, and their originals are theirs.
 */

/** Photos and bytes the browser zips by itself, the same bounds as the styled export. */
export const BROWSER_MAX_PHOTOS = MAX_BATCH
export const BROWSER_MAX_BYTES = ARCHIVE_CEILING_BYTES

/**
 * The most one part holds: "at most 4 GB", and inside the format's 32-bit
 * sizes and offsets (4 GiB), so no part needs ZIP64. The metadata files and
 * the zip records come out of the headroom between the two.
 */
export const PART_MAX_BYTES = 4_000_000_000
/** Files in one part, inside the format's 65,535 with room for the metadata files. */
export const PART_MAX_FILES = 65_000

export { EXPORT_DAYS, LIBRARY_EXPORT_DAYS } from './exportRules'

const DAY_MS = 24 * 60 * 60 * 1000

export type ExportRequest =
  | { scope: 'library' }
  | { scope: 'roll'; rollId: string }
  | { scope: 'album'; albumId: string }
  | { scope: 'selection'; photoIds: string[] }

/** The request a client sent, or null when it is not one. */
export function parseExportRequest(body: unknown): ExportRequest | null {
  if (!body || typeof body !== 'object') return null
  const b = body as Record<string, unknown>
  if (b.scope === 'library') return { scope: 'library' }
  if (b.scope === 'roll' && typeof b.rollId === 'string' && b.rollId) return { scope: 'roll', rollId: b.rollId }
  if (b.scope === 'album' && typeof b.albumId === 'string' && b.albumId) return { scope: 'album', albumId: b.albumId }
  if (b.scope === 'selection' && Array.isArray(b.photoIds) && b.photoIds.length > 0 && b.photoIds.length <= 20_000
    && b.photoIds.every(id => typeof id === 'string')) {
    return { scope: 'selection', photoIds: [...new Set(b.photoIds as string[])] }
  }
  return null
}

export interface ResolvedExport {
  title: string
  /** The owner's photos in it, in export order: roll by roll, frame order, loose photos last. */
  photoIds: string[]
  bytes: number
  /** Photos in an album that belong to someone else, left out. */
  othersLeftOut: number
}

/**
 * The owner's photos an export covers, or null when the roll or album is not
 * theirs to export (or does not exist): the same answer either way.
 */
export async function resolveExport(userId: string, request: ExportRequest): Promise<ResolvedExport | null> {
  let title = 'Library'
  let filter = Prisma.empty
  let othersLeftOut = 0
  if (request.scope === 'roll') {
    const roll = await prisma.roll.findFirst({ where: { id: request.rollId, ownerId: userId }, select: { id: true, title: true, shotFrom: true, shotFromPrecision: true } })
    if (!roll) return null
    title = roll.title || formatRollDate(roll.shotFrom, roll.shotFromPrecision) || 'Roll'
    filter = Prisma.sql`AND p."rollId" = ${roll.id}`
  } else if (request.scope === 'album') {
    const album = await prisma.collection.findFirst({ where: { id: request.albumId, userId }, select: { id: true, name: true } })
    if (!album) return null
    title = album.name
    filter = Prisma.sql`AND p.id IN (SELECT "photoId" FROM "CollectionPhoto" WHERE "collectionId" = ${album.id})`
    othersLeftOut = await prisma.collectionPhoto.count({ where: { collectionId: album.id, photo: { userId: { not: userId } } } })
  } else if (request.scope === 'selection') {
    title = 'Selection'
    filter = Prisma.sql`AND p.id = ANY(${request.photoIds})`
  }
  const rows = await prisma.$queryRaw<{ id: string; bytes: bigint | null }[]>`
    SELECT p.id, p."originalBytes"::bigint AS bytes FROM "Photo" p LEFT JOIN "Roll" r ON r.id = p."rollId"
    WHERE p."userId" = ${userId} AND p.kind = 'community' AND p."uploadComplete" AND p."deletedAt" IS NULL
      AND p."originalKey" IS NOT NULL ${filter}
    ORDER BY p."rollId" IS NULL, COALESCE(r."shotFrom", r."createdAt"::date), r.id,
      p."rollPosition" ASC NULLS LAST, p."createdAt" ASC, p.id ASC`
  return {
    title,
    photoIds: rows.map(r => r.id),
    bytes: rows.reduce((sum, r) => sum + Number(r.bytes ?? 0), 0),
    othersLeftOut,
  }
}

/** Whether the browser zips this one itself. */
export function zipsInBrowser(resolved: Pick<ResolvedExport, 'photoIds' | 'bytes'>): boolean {
  return resolved.photoIds.length <= BROWSER_MAX_PHOTOS && resolved.bytes <= BROWSER_MAX_BYTES
}

/** One photo in an export: where it goes in the zip, where it is read from, and its details. */
export interface ExportEntry {
  id: string
  path: string
  originalKey: string
  /** As recorded at upload; null for an older photo that never recorded it. */
  bytes: number | null
  sha256: string | null
  details: ExportDetails
}

/** A photo's details, as photos.json gives them. */
export interface ExportDetails {
  path: string
  photoId: string
  originalFilename: string | null
  bytes: number | null
  sha256: string | null
  width: number
  height: number
  caption: string | null
  takenDate: string | null
  film: string | null
  camera: string | null
  lab: string | null
  roll: {
    id: string
    title: string | null
    frame: number | null
    shotFrom: string | null
    shotTo: string | null
    developedAt: string | null
    location: string | null
    notes: string | null
    ei: number | null
    scanner: string | null
  } | null
  published: boolean
  uploadedAt: string
  /** The photo's page, while it is published. */
  pageUrl: string | null
}

const ENTRY_SELECT = {
  id: true, originalKey: true, originalFilename: true, originalBytes: true, originalSha256: true, format: true,
  width: true, height: true, caption: true, takenDate: true, visibility: true, screening: true, createdAt: true,
  rollPosition: true,
  filmStock: { select: { name: true, brand: true } },
  camera: { select: { name: true, brand: true } },
  lab: { select: { name: true } },
  roll: {
    select: {
      id: true, title: true, shotFrom: true, shotFromPrecision: true, shotTo: true, shotToPrecision: true,
      developedAt: true, developedAtPrecision: true, location: true, notes: true, ei: true, scannerModel: true,
    },
  },
} as const

type EntryRow = Prisma.PhotoGetPayload<{ select: typeof ENTRY_SELECT }>

/** Whether a name says anything once made safe: a letter or a digit. */
const readable = (name: string) => /[a-z0-9]/i.test(name)

/** The folder a roll's photos go in: "2026-10-12 Harbour", or its date and gear when it has no title. */
function rollFolder(roll: NonNullable<EntryRow['roll']>, row: EntryRow): string {
  const date = formatRollDate(roll.shotFrom, roll.shotFromPrecision) ?? 'Undated'
  const name = safePart(roll.title || [displayName(row.filmStock), displayName(row.camera)].filter(Boolean).join(' '))
  // A title that is nothing readable once made safe (all outside ASCII, see
  // safeName) leaves the date alone rather than "2026-10 -".
  return readable(name) ? `${date} ${name}` : date
}

/** The name the file is saved under: as it was uploaded, else the photo's id with its format. */
function fileName(row: EntryRow): string {
  const fromKey = row.originalKey?.match(/\.([a-z0-9]+)$/i)?.[1]
  const ext = (fromKey || row.format || 'jpg').toLowerCase()
  const given = row.originalFilename?.split(/[\\/]/).pop() ?? ''
  const dot = given.lastIndexOf('.')
  const stem = safePart(dot > 0 ? given.slice(0, dot) : given)
  return readable(stem) ? `${stem}${dot > 0 ? `.${safePart(given.slice(dot + 1)) || ext}` : `.${ext}`}` : `${row.id}.${ext}`
}

/**
 * Every photo's place in the zip and its details, in the order given. Folder
 * names are made distinct per roll, and file names within a folder, without
 * case, as the file systems these are unpacked onto compare them.
 */
export async function exportEntries(userId: string, photoIds: string[]): Promise<ExportEntry[]> {
  const rows = await prisma.photo.findMany({
    where: { id: { in: photoIds }, userId, originalKey: { not: null } },
    select: ENTRY_SELECT,
  })
  const byId = new Map(rows.map(r => [r.id, r]))
  const ordered = photoIds.map(id => byId.get(id)).filter((r): r is EntryRow => r !== undefined)

  const folderOf = new Map<string, string>()
  const rollIds = [...new Set(ordered.map(r => r.roll?.id ?? ''))]
  const folders = uniqueNames(rollIds.map(id => {
    const row = ordered.find(r => (r.roll?.id ?? '') === id)!
    return row.roll ? rollFolder(row.roll, row) : 'Loose photos'
  }))
  rollIds.forEach((id, i) => folderOf.set(id, folders[i]))
  const paths = uniqueNames(ordered.map(r => `${folderOf.get(r.roll?.id ?? '')}/${fileName(r)}`))

  return ordered.map((r, i) => {
    const published = r.visibility === 'PUBLIC' && r.screening === 'CLEAR'
    const details: ExportDetails = {
      path: paths[i],
      photoId: r.id,
      originalFilename: r.originalFilename,
      bytes: r.originalBytes,
      sha256: r.originalSha256,
      width: r.width,
      height: r.height,
      caption: r.caption,
      takenDate: r.takenDate ? r.takenDate.toISOString().slice(0, 10) : null,
      film: displayName(r.filmStock),
      camera: displayName(r.camera),
      lab: r.lab?.name ?? null,
      roll: r.roll ? {
        id: r.roll.id,
        title: r.roll.title,
        frame: r.rollPosition,
        shotFrom: formatRollDate(r.roll.shotFrom, r.roll.shotFromPrecision),
        shotTo: formatRollDate(r.roll.shotTo, r.roll.shotToPrecision),
        developedAt: formatRollDate(r.roll.developedAt, r.roll.developedAtPrecision),
        location: r.roll.location,
        notes: r.roll.notes,
        ei: r.roll.ei,
        scanner: r.roll.scannerModel,
      } : null,
      published,
      uploadedAt: r.createdAt.toISOString(),
      pageUrl: published ? `${SITE_URL}/photos/${r.id}` : null,
    }
    return { id: r.id, path: paths[i], originalKey: r.originalKey!, bytes: r.originalBytes, sha256: r.originalSha256, details }
  })
}

/** A photo's line in the metadata, with the part it is in and whether it made it. */
export type MetadataRow = ExportDetails & { part: number | null; status: 'ok' | 'missing' }

const CSV_COLUMNS: [string, (r: MetadataRow) => string | number | boolean | null][] = [
  ['path', r => r.path],
  ['part', r => r.part],
  ['status', r => r.status],
  ['photo_id', r => r.photoId],
  ['original_filename', r => r.originalFilename],
  ['bytes', r => r.bytes],
  ['sha256', r => r.sha256],
  ['width', r => r.width],
  ['height', r => r.height],
  ['caption', r => r.caption],
  ['taken_date', r => r.takenDate],
  ['film', r => r.film],
  ['camera', r => r.camera],
  ['lab', r => r.lab],
  ['roll_id', r => r.roll?.id ?? null],
  ['roll_title', r => r.roll?.title ?? null],
  ['frame', r => r.roll?.frame ?? null],
  ['roll_shot_from', r => r.roll?.shotFrom ?? null],
  ['roll_shot_to', r => r.roll?.shotTo ?? null],
  ['roll_developed', r => r.roll?.developedAt ?? null],
  ['roll_location', r => r.roll?.location ?? null],
  ['roll_notes', r => r.roll?.notes ?? null],
  ['roll_ei', r => r.roll?.ei ?? null],
  ['scanner', r => r.roll?.scanner ?? null],
  ['published', r => r.published],
  ['uploaded_at', r => r.uploadedAt],
  ['page_url', r => r.pageUrl],
]

function csvCell(value: string | number | boolean | null): string {
  if (value === null) return ''
  const text = String(value)
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

/**
 * photos.csv and photos.json. Every part of a multi-part export carries both,
 * listing every photo with the part it is in, so any one part explains
 * itself. The CSV starts with a byte order mark so spreadsheet apps read it
 * as UTF-8.
 */
export function metadataFiles(rows: MetadataRow[], about: { title: string; exportedAt: Date }): { csv: string; json: string } {
  const csv = '﻿' + [CSV_COLUMNS.map(([name]) => name).join(','), ...rows.map(r => CSV_COLUMNS.map(([, get]) => csvCell(get(r))).join(','))].join('\r\n') + '\r\n'
  const json = JSON.stringify({ export: about.title, exportedAt: about.exportedAt.toISOString(), photos: rows }, null, 2) + '\n'
  return { csv, json }
}

/**
 * The entries split into parts in order, each under PART_MAX_BYTES and
 * PART_MAX_FILES with `reserve` bytes kept for the metadata files and the zip
 * records. A roll stays in one part when it fits; one too big for any part
 * still gets a part of its own.
 */
export function planParts<T extends { bytes: number | null; path: string }>(entries: T[], reserve: number, maxBytes = PART_MAX_BYTES): T[][] {
  const parts: T[][] = []
  let current: T[] = []
  let size = 0
  for (const entry of entries) {
    // Per file: its bytes and two copies of its path (local header and directory) plus the fixed records.
    const cost = (entry.bytes ?? 0) + 76 + 2 * Buffer.byteLength(entry.path)
    if (current.length > 0 && (size + cost > maxBytes - reserve || current.length >= PART_MAX_FILES)) {
      parts.push(current)
      current = []
      size = 0
    }
    current.push(entry)
    size += cost
  }
  if (current.length) parts.push(current)
  return parts
}

export interface ExportLimit {
  ok: boolean
  /** Why not, in a sentence for the page. */
  reason?: string
  /** When a whole-library export can be asked for again. */
  nextAt?: Date
}

/**
 * Whether this account may queue an export now: one at a time, and one
 * whole-library export per LIBRARY_EXPORT_DAYS unless they are an admin. A
 * failed export does not count, since the failure was the site's.
 */
export async function exportLimit(user: { id: string; isAdmin: boolean }, scope: ExportRequest['scope']): Promise<ExportLimit> {
  const active = await prisma.libraryExport.findFirst({
    where: { userId: user.id, state: { in: ['QUEUED', 'BUILDING'] } },
    select: { id: true },
  })
  if (active) return { ok: false, reason: 'An export is already being built. Start another once it is ready.' }
  if (scope !== 'library' || user.isAdmin) return { ok: true }
  const last = await prisma.libraryExport.findFirst({
    where: { userId: user.id, scope: 'LIBRARY', state: { not: 'FAILED' }, createdAt: { gt: new Date(Date.now() - LIBRARY_EXPORT_DAYS * DAY_MS) } },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true },
  })
  if (!last) return { ok: true }
  const nextAt = new Date(last.createdAt.getTime() + LIBRARY_EXPORT_DAYS * DAY_MS)
  return { ok: false, reason: 'You can export your whole library once a week.', nextAt }
}

/** The key one part is stored under: private, random, never listed by the media mirror. */
export function partKey(exportId: string, part: number, token: string): string {
  return `exports/${exportId}/${token}/part-${part}.zip`
}

/** The part's file name when downloaded: "avoidxray-harbour-2026-10-31-part-1-of-2.zip". */
export function partFileName(title: string, createdAt: Date, part: number, of: number): string {
  const slug = safeName(title).toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '') || 'export'
  return `avoidxray-${slug}-${createdAt.toISOString().slice(0, 10)}${of > 1 ? `-part-${part}-of-${of}` : ''}.zip`
}

export interface StoredPart {
  key: string
  bytes: number
  photos: number
}

/** An export as the library's Exports page reads it. */
export interface ExportView {
  id: string
  scope: 'library' | 'roll' | 'album' | 'selection'
  title: string
  state: 'queued' | 'building' | 'ready' | 'failed' | 'expired'
  photos: number
  done: number
  skipped: number
  bytes: number | null
  parts: { number: number; bytes: number; photos: number; name: string }[]
  error: string | null
  createdAt: string
  finishedAt: string | null
  expiresAt: string | null
}

export function exportView(e: Prisma.LibraryExportGetPayload<object>): ExportView {
  const parts = ((e.parts as unknown as StoredPart[] | null) ?? [])
  return {
    id: e.id,
    scope: e.scope.toLowerCase() as ExportView['scope'],
    title: e.title,
    state: e.state.toLowerCase() as ExportView['state'],
    photos: e.photoIds.length,
    done: e.done,
    skipped: e.skipped,
    bytes: e.bytes === null ? null : Number(e.bytes),
    parts: e.state === 'READY'
      ? parts.map((p, i) => ({ number: i + 1, bytes: p.bytes, photos: p.photos, name: partFileName(e.title, e.createdAt, i + 1, parts.length) }))
      : [],
    error: e.error,
    createdAt: e.createdAt.toISOString(),
    finishedAt: e.finishedAt?.toISOString() ?? null,
    expiresAt: e.expiresAt?.toISOString() ?? null,
  }
}
