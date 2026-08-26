import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { canViewPhoto } from '@/lib/photoVisibility'
import { bylineUserSelect } from '@/lib/publicUser'
import { VALIDATION_LIMITS } from '@/lib/validation'
import { enforceLimit } from '@/lib/rateLimit'
import { LIMITS } from '@/lib/rateLimitPolicy'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { photoId, content } = await req.json()
  if (typeof photoId !== 'string' || !photoId || typeof content !== 'string' || !content.trim()) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }
  if (content.trim().length > VALIDATION_LIMITS.MAX_COMMENT_LENGTH) {
    return NextResponse.json(
      { error: `Comments must be ${VALIDATION_LIMITS.MAX_COMMENT_LENGTH} characters or fewer` },
      { status: 400 }
    )
  }

  const userId = (session.user as { id: string }).id

  const limited = enforceLimit(
    'comment', userId, LIMITS.contentWrite.perUser,
    'You are commenting very quickly. Please wait a moment.'
  )
  if (limited) return limited

  // Resolved before the insert, not after. The comment used to be created
  // first, so an id for a photo that did not exist failed the foreign key
  // check as an unhandled 500 — and one that did exist but was private was
  // commentable by a stranger who could not see it.
  const photo = await prisma.photo.findUnique({
    where: { id: photoId },
    select: { userId: true, published: true, visibility: true }
  })
  if (!photo || !canViewPhoto(photo, userId)) {
    return NextResponse.json({ error: 'Photo not found' }, { status: 404 })
  }

  const comment = await prisma.comment.create({
    data: { userId, photoId, content: content.trim() },
    include: { user: { select: bylineUserSelect } }
  })

  // Create notification for photo owner
  if (photo.userId !== userId) {
    await prisma.notification.create({
      data: { type: 'comment', userId: photo.userId, actorId: userId, photoId }
    })
  }

  return NextResponse.json(comment)
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) {
    return NextResponse.json({ error: 'Missing id' }, { status: 400 })
  }

  const userId = (session.user as { id: string }).id
  const comment = await prisma.comment.findUnique({ where: { id } })

  if (!comment || comment.userId !== userId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  await prisma.comment.delete({ where: { id } })
  return NextResponse.json({ success: true })
}
