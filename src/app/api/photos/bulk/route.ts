import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { deleteFromOSS } from '@/lib/oss'
import { extractKeyFromUrl } from '@/lib/ossUtils'
import { enforceLimit } from '@/lib/rateLimit'
import { LIMITS } from '@/lib/rateLimitPolicy'

/**
 * Applies one change to many of your own photos at once.
 *
 * A roll is thirty-six frames that share a camera, a film stock and a date, and
 * fixing a mistake on all of them meant opening each photo's edit page in turn.
 *
 * Ownership is resolved from the session and applied as part of the query
 * rather than checked beforehand: `updateMany({ where: { id: { in: ids },
 * userId } })` cannot touch a row belonging to someone else even if an id for
 * one is submitted, and reports how many it actually matched.
 */

/** Bounded so one request cannot ask for unbounded work. */
const MAX_IDS = 200

const CAPTION_MAX = 2000

interface Changes {
  cameraId?: string | null
  filmStockId?: string | null
  takenDate?: string | null
  visibility?: 'PUBLIC' | 'PRIVATE'
  caption?: string | null
}

function parseIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  return [...new Set(raw.filter((v): v is string => typeof v === 'string' && v.length > 0))].slice(0, MAX_IDS)
}

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as { id: string }).id

  const limited = enforceLimit(
    'photo-bulk', userId, LIMITS.contentWrite.perUser,
    'Too many changes at once. Please wait a moment.'
  )
  if (limited) return limited

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  const ids = parseIds((body as { ids?: unknown }).ids)
  if (ids.length === 0) return NextResponse.json({ error: 'No photos selected' }, { status: 400 })

  const changes = (body as { changes?: Changes }).changes ?? {}
  const data: Record<string, unknown> = {}

  if ('cameraId' in changes) {
    if (changes.cameraId) {
      const exists = await prisma.camera.findUnique({ where: { id: changes.cameraId }, select: { id: true } })
      if (!exists) return NextResponse.json({ error: 'That camera no longer exists' }, { status: 400 })
      data.cameraId = changes.cameraId
    } else {
      data.cameraId = null
    }
  }

  if ('filmStockId' in changes) {
    if (changes.filmStockId) {
      const exists = await prisma.filmStock.findUnique({ where: { id: changes.filmStockId }, select: { id: true } })
      if (!exists) return NextResponse.json({ error: 'That film stock no longer exists' }, { status: 400 })
      data.filmStockId = changes.filmStockId
    } else {
      data.filmStockId = null
    }
  }

  if ('takenDate' in changes) {
    if (changes.takenDate) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(changes.takenDate)) {
        return NextResponse.json({ error: 'Date must be YYYY-MM-DD' }, { status: 400 })
      }
      const date = new Date(`${changes.takenDate}T00:00:00.000Z`)
      if (Number.isNaN(date.getTime())) {
        return NextResponse.json({ error: 'That is not a real date' }, { status: 400 })
      }
      data.takenDate = date
    } else {
      data.takenDate = null
    }
  }

  if ('visibility' in changes) {
    if (changes.visibility !== 'PUBLIC' && changes.visibility !== 'PRIVATE') {
      return NextResponse.json({ error: 'Visibility must be public or private' }, { status: 400 })
    }
    data.visibility = changes.visibility
  }

  if ('caption' in changes) {
    const caption = typeof changes.caption === 'string' ? changes.caption.trim() : ''
    if (caption.length > CAPTION_MAX) {
      return NextResponse.json({ error: `Caption must be ${CAPTION_MAX} characters or fewer` }, { status: 400 })
    }
    data.caption = caption || null
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: 'Nothing to change' }, { status: 400 })
  }

  const result = await prisma.photo.updateMany({ where: { id: { in: ids }, userId }, data })
  return NextResponse.json({ updated: result.count, requested: ids.length })
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as { id: string }).id

  const limited = enforceLimit(
    'photo-bulk-delete', userId, LIMITS.contentWrite.perUser,
    'Too many deletions at once. Please wait a moment.'
  )
  if (limited) return limited

  const body = await req.json().catch(() => null)
  const ids = parseIds((body as { ids?: unknown } | null)?.ids)
  if (ids.length === 0) return NextResponse.json({ error: 'No photos selected' }, { status: 400 })

  // Scoped to the owner, so an id belonging to someone else simply is not found
  // and the storage cleanup below never sees their files.
  const photos = await prisma.photo.findMany({
    where: { id: { in: ids }, userId },
    select: { id: true, originalPath: true, mediumPath: true, thumbnailPath: true },
  })
  if (photos.length === 0) return NextResponse.json({ error: 'Nothing to delete' }, { status: 404 })

  const keys = photos.flatMap(p => [p.originalPath, p.mediumPath, p.thumbnailPath])
    .map(extractKeyFromUrl)
    .filter((k): k is string => k !== null)
  await Promise.all(keys.map(key => deleteFromOSS(key).catch(() => {})))

  const result = await prisma.photo.deleteMany({ where: { id: { in: photos.map(p => p.id) }, userId } })
  return NextResponse.json({ deleted: result.count })
}
