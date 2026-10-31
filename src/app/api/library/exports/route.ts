import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireLibraryUser } from '@/lib/library/access'
import {
  EXPORT_DAYS, exportEntries, exportLimit, exportView, metadataFiles, parseExportRequest, partFileName, resolveExport, zipsInBrowser,
} from '@/lib/library/exports'
import { signedObjectUrl } from '@/lib/oss'
import { readJsonObject } from '@/lib/requestBody'

/** The owner's exports from the last EXPORT_DAYS and a day, newest first. */
export async function GET() {
  const user = await requireLibraryUser()
  if (user instanceof NextResponse) return user
  const since = new Date(Date.now() - (EXPORT_DAYS + 1) * 24 * 60 * 60 * 1000)
  const [exports, library] = await Promise.all([
    prisma.libraryExport.findMany({
      where: { userId: user.id, createdAt: { gt: since } },
      orderBy: { createdAt: 'desc' },
      take: 50,
    }),
    exportLimit(user, 'library'),
  ])
  return NextResponse.json({
    exports: exports.map(exportView),
    library: { ok: library.ok, reason: library.reason ?? null, nextAt: library.nextAt?.toISOString() ?? null },
  })
}

/**
 * Starts an export of original files. A small one is answered with what the
 * browser needs to zip it itself: each original's place in the zip and a
 * signed address, and the metadata files. A larger one is queued for the
 * export worker, within the limits in exportLimit.
 */
export async function POST(req: NextRequest) {
  const user = await requireLibraryUser()
  if (user instanceof NextResponse) return user
  const body = await readJsonObject(req)
  const request = parseExportRequest(body)
  if (!request) return NextResponse.json({ error: 'Say what to export' }, { status: 400 })

  const resolved = await resolveExport(user.id, request)
  if (!resolved) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!resolved.photoIds.length) {
    return NextResponse.json({ error: 'There are no photos of yours to export here' }, { status: 400 })
  }

  if (zipsInBrowser(resolved)) {
    const entries = await exportEntries(user.id, resolved.photoIds)
    const now = new Date()
    const metadata = metadataFiles(entries.map(e => ({ ...e.details, part: null, status: 'ok' as const })), { title: resolved.title, exportedAt: now })
    return NextResponse.json({
      mode: 'browser',
      zipName: partFileName(resolved.title, now, 1, 1),
      othersLeftOut: resolved.othersLeftOut,
      files: await Promise.all(entries.map(async e => ({ path: e.path, url: await signedObjectUrl(e.originalKey), bytes: e.bytes }))),
      metadata,
    })
  }

  const limit = await exportLimit(user, request.scope)
  if (!limit.ok) {
    return NextResponse.json({ error: limit.reason, nextAt: limit.nextAt?.toISOString() ?? null }, { status: 429 })
  }
  const created = await prisma.libraryExport.create({
    data: {
      userId: user.id,
      scope: request.scope.toUpperCase() as 'LIBRARY' | 'ROLL' | 'ALBUM' | 'SELECTION',
      scopeId: request.scope === 'roll' ? request.rollId : request.scope === 'album' ? request.albumId : null,
      title: resolved.title,
      photoIds: resolved.photoIds,
    },
  })
  return NextResponse.json({ mode: 'server', othersLeftOut: resolved.othersLeftOut, export: exportView(created) }, { status: 202 })
}
