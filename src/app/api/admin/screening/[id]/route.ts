import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAdmin } from '@/lib/admin/auth'
import { asString, invalidBody, readJsonObject } from '@/lib/requestBody'
import { deleteFromOSS } from '@/lib/oss'
import { extractKeyFromUrl } from '@/lib/ossUtils'

/**
 * An admin's decision on a photo the nudity check held.
 *
 * - approve: the flag was wrong. The photo becomes public, if its owner set it
 *   public, and its score is kept so the check does not hold it again.
 * - reject: the flag was right. It stays hidden from everyone but its owner.
 * - delete: the flag was right and the photo should not be kept at all. The
 *   row goes, then its files. This one cannot be undone.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin()
  if (denied) return denied

  const body = await readJsonObject(req)
  if (!body) return invalidBody()
  const action = asString(body.action)
  if (action !== 'approve' && action !== 'reject' && action !== 'delete') {
    return NextResponse.json({ error: 'action must be approve, reject or delete' }, { status: 400 })
  }

  const { id } = await params

  if (action === 'delete') {
    const photo = await prisma.photo.findFirst({
      where: { id, screening: { in: ['HELD', 'REJECTED'] } },
      select: { userId: true, originalPath: true, mediumPath: true, thumbnailPath: true },
    })
    if (!photo) return NextResponse.json({ error: 'That photo is not in the review queue' }, { status: 404 })
    // Row first, then files, as everywhere photos are deleted: a failed file
    // delete leaves an orphan for the sweep, never a row with no image.
    // The state is checked again here: an approval landing between the read
    // above and this delete would otherwise be overridden.
    const { count } = await prisma.photo.deleteMany({ where: { id, screening: { in: ['HELD', 'REJECTED'] } } })
    if (count === 0) return NextResponse.json({ error: 'That photo is not in the review queue' }, { status: 404 })
    // Not tied to the photo, which is gone, or it would go with it.
    await prisma.notification.create({ data: { type: 'deleted', userId: photo.userId, actorId: photo.userId } })
    await Promise.all(
      [photo.originalPath, photo.mediumPath, photo.thumbnailPath]
        .map(extractKeyFromUrl)
        .filter((key): key is string => key !== null)
        .map(key => deleteFromOSS(key).catch(() => {}))
    )
    return NextResponse.json({ ok: true })
  }

  const { count } = await prisma.photo.updateMany({
    where: { id, screening: action === 'approve' ? { in: ['HELD', 'REJECTED'] } : 'HELD' },
    data: { screening: action === 'approve' ? 'CLEAR' : 'REJECTED' },
  })
  if (count === 0) {
    return NextResponse.json({ error: 'That photo is not waiting for a decision' }, { status: 404 })
  }

  // The owner hears the outcome either way, as they heard about the hold.
  // Only for a published photo: a draft is not "now public", and the
  // cleanup job removes it within the hour.
  const photo = await prisma.photo.findUnique({ where: { id }, select: { userId: true, published: true } })
  if (photo?.published) {
    await prisma.notification.create({
      data: { type: action === 'approve' ? 'approved' : 'rejected', userId: photo.userId, actorId: photo.userId, photoId: id },
    })
  }
  return NextResponse.json({ ok: true })
}
