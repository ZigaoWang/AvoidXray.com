import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import type { Prisma } from '@prisma/client'
import { deleteFromOSS } from '@/lib/oss'
import { extractKeyFromUrl } from '@/lib/ossUtils'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { readJsonObject, invalidBody } from '@/lib/requestBody'
import { enforceLimit } from '@/lib/rateLimit'
import { LIMITS } from '@/lib/rateLimitPolicy'

type Draft = { id: string; originalPath: string; mediumPath: string; thumbnailPath: string }

/** How long an unpublished upload is left alone before it counts as abandoned. */
const ABANDONED_AFTER_MS = 60 * 60 * 1000

/**
 * Deletes the drafts that are still unpublished, rows first, and then the files
 * of the rows that actually went.
 *
 * Files went first before, so a publish landing between the read and the
 * delete kept its row (the delete is scoped to published=false) and lost its
 * images: a published photo with nothing behind it.
 */
async function purgeDrafts(photos: Draft[], where: Prisma.PhotoWhereInput = {}): Promise<number> {
  if (!photos.length) return 0
  const ids = photos.map(p => p.id)
  const { count } = await prisma.photo.deleteMany({
    where: { ...where, id: { in: ids }, published: false },
  })
  const kept = new Set(
    (await prisma.photo.findMany({ where: { id: { in: ids } }, select: { id: true } })).map(p => p.id)
  )
  const keys = photos
    .filter(p => !kept.has(p.id))
    .flatMap(p => [p.originalPath, p.mediumPath, p.thumbnailPath])
    .map(extractKeyFromUrl)
    .filter((k): k is string => k !== null)
  await Promise.all(keys.map(key => deleteFromOSS(key).catch(() => {})))
  return count
}

const draftSelect = { id: true, originalPath: true, mediumPath: true, thumbnailPath: true } as const

// GET: Cron job to clean up old unpublished photos
// Requires CRON_SECRET in production
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  // In production, require CRON_SECRET
  if (process.env.NODE_ENV === 'production') {
    if (!cronSecret) {
      return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 })
    }
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Sign in to do that' }, { status: 401 })
    }
  }

  const oldPhotos = await prisma.photo.findMany({
    where: { published: false, createdAt: { lt: new Date(Date.now() - ABANDONED_AFTER_MS) } },
    select: draftSelect,
  })
  const deleted = await purgeDrafts(oldPhotos)

  return NextResponse.json({ success: true, deleted, checked: oldPhotos.length })
}

/**
 * Upper bound on ids accepted in one request, matching the bulk photo routes.
 *
 * Without it a single call became an unbounded `IN (...)` and an unbounded set
 * of storage deletions. Truncating rather than refusing is safe here because
 * the GET sweep above collects anything left behind within the hour.
 */
const MAX_IDS = 200

// POST: User-initiated cleanup for their own unpublished photos
// Called when user leaves upload page without publishing
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'Sign in to do that' }, { status: 401 })
  }

  const userId = (session.user as { id: string }).id

  // Sized against the upload limit rather than the content-write one: the
  // upload page calls this once per photo removed from a drop, so pruning a
  // roll frame by frame is legitimately one request each. Its own namespace,
  // so uploading and tidying up do not draw on a single allowance.
  const limited = enforceLimit(
    'upload-cleanup', userId, LIMITS.upload.perUser,
    'Too many deletions in a short time. Please wait a little and continue.'
  )
  if (limited) return limited

  const body = await readJsonObject(req)
  if (!body) return invalidBody()
  // Only the string members count; a mixed array should not reach the query.
  const ids = Array.isArray(body.ids)
    ? [...new Set(body.ids.filter((id): id is string => typeof id === 'string' && id.length > 0))].slice(0, MAX_IDS)
    : []
  if (!ids.length) return NextResponse.json({ success: true, deleted: 0 })

  // The same test the per-row check made — yours, and not yet published —
  // expressed as part of the query, so an id belonging to someone else is
  // simply not found and the storage deletion below never sees their files.
  const photos = await prisma.photo.findMany({
    where: { id: { in: ids }, userId, published: false },
    select: draftSelect,
  })
  if (!photos.length) return NextResponse.json({ success: true, deleted: 0 })

  // Ownership is repeated on the delete so a publish that landed between the
  // two queries keeps its row rather than losing it to a stale read.
  const deleted = await purgeDrafts(photos, { userId })

  return NextResponse.json({ success: true, deleted })
}

// DELETE: Admin endpoint to force cleanup all unpublished photos
export async function DELETE() {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'Sign in to do that' }, { status: 401 })
  }

  const user = await prisma.user.findUnique({
    where: { id: (session.user as { id: string }).id }
  })

  if (!user?.isAdmin) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  // The same age as the sweep. With no age at all this also took uploads
  // still in progress on somebody's upload page.
  const unpublishedPhotos = await prisma.photo.findMany({
    where: { published: false, createdAt: { lt: new Date(Date.now() - ABANDONED_AFTER_MS) } },
    select: draftSelect,
  })
  const deleted = await purgeDrafts(unpublishedPhotos)

  return NextResponse.json({ success: true, deleted })
}
