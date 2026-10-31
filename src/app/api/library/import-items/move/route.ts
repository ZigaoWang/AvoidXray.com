import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireLibraryUser } from '@/lib/library/access'
import { enforceLimit } from '@/lib/rateLimit'
import { LIMITS } from '@/lib/rateLimitPolicy'
import { invalidBody, readJsonObject } from '@/lib/requestBody'

const MAX_FRAMES = 500

type Frame = { itemId: string } | { photoId: string }

/**
 * Puts frames in a roll, numbered in the order given, or makes them loose.
 *
 * A frame is an import item, or a photo already in the library: a folder
 * dropped again is numbered with the photos it made the first time. Merging
 * rolls, splitting one, reordering frames and marking files loose are all this
 * one move. An item already made into a photo moves its photo too, and a
 * photo takes the new roll's details.
 */
export async function POST(req: NextRequest) {
  const user = await requireLibraryUser({ actAs: true })
  if (user instanceof NextResponse) return user
  const limited = enforceLimit('import', user.id, LIMITS.import.perUser, 'Too many requests. Wait a minute and try again.')
  if (limited) return limited

  const body = await readJsonObject(req)
  const frames = parseFrames(body?.frames)
  const rollId = body?.rollId === null ? null : typeof body?.rollId === 'string' ? body.rollId : undefined
  const firstPosition = body?.firstPosition === undefined ? 1 : body.firstPosition
  if (!frames || rollId === undefined || !Number.isInteger(firstPosition) || (firstPosition as number) < 1) {
    return invalidBody()
  }

  if (rollId && !(await prisma.roll.count({ where: { id: rollId, ownerId: user.id } }))) {
    return NextResponse.json({ error: 'That roll is not in your library' }, { status: 404 })
  }
  const itemIds = frames.flatMap(f => ('itemId' in f ? [f.itemId] : []))
  const photoIds = frames.flatMap(f => ('photoId' in f ? [f.photoId] : []))
  const [items, photos] = await Promise.all([
    prisma.importItem.findMany({ where: { id: { in: itemIds }, userId: user.id }, select: { id: true, photoId: true } }),
    prisma.photo.count({ where: { id: { in: photoIds }, userId: user.id, kind: 'COMMUNITY' } }),
  ])
  if (items.length !== itemIds.length || photos !== photoIds.length) {
    return NextResponse.json({ error: 'Some of those files are not in your library' }, { status: 404 })
  }
  const photoOf = new Map(items.map(i => [i.id, i.photoId]))

  await prisma.$transaction(frames.flatMap((frame, i) => {
    const place = { rollId, rollPosition: rollId ? (firstPosition as number) + i : null }
    if ('photoId' in frame) return [prisma.photo.update({ where: { id: frame.photoId }, data: place })]
    const photoId = photoOf.get(frame.itemId)
    return [
      prisma.importItem.update({ where: { id: frame.itemId }, data: place }),
      ...(photoId ? [prisma.photo.update({ where: { id: photoId }, data: place })] : []),
    ]
  }))
  return NextResponse.json({ ok: true })
}

function parseFrames(raw: unknown): Frame[] | null {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_FRAMES) return null
  const frames: Frame[] = []
  const seen = new Set<string>()
  for (const entry of raw) {
    const e = entry as Record<string, unknown>
    const frame = typeof e?.itemId === 'string' ? { itemId: e.itemId } : typeof e?.photoId === 'string' ? { photoId: e.photoId } : null
    if (!frame) return null
    const id = 'itemId' in frame ? `i:${frame.itemId}` : `p:${frame.photoId}`
    if (seen.has(id)) return null
    seen.add(id)
    frames.push(frame)
  }
  return frames
}
