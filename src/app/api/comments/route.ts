import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { canViewPhoto } from '@/lib/photoVisibility'
import { bylineUserSelect } from '@/lib/publicUser'
import { VALIDATION_LIMITS } from '@/lib/validation'
import { enforceLimit } from '@/lib/rateLimit'
import { LIMITS } from '@/lib/rateLimitPolicy'
import { readJsonObject, invalidBody } from '@/lib/requestBody'
import { blockedFromInteracting } from '@/lib/blocks'
import { hasBlockedWords, blockedWordsMessage } from '@/lib/wordFilter'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'Sign in to do that' }, { status: 401 })
  }

  const body = await readJsonObject(req)

  if (!body) return invalidBody()

  const { photoId, content } = body
  if (typeof photoId !== 'string' || !photoId || typeof content !== 'string' || !content.trim()) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }
  if (content.trim().length > VALIDATION_LIMITS.MAX_COMMENT_LENGTH) {
    return NextResponse.json(
      { error: `Comments must be ${VALIDATION_LIMITS.MAX_COMMENT_LENGTH} characters or fewer` },
      { status: 400 }
    )
  }
  if (hasBlockedWords(content, 'text')) {
    return NextResponse.json({ error: blockedWordsMessage('Your comment') }, { status: 400 })
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
    select: { kind: true, userId: true, published: true, visibility: true, screening: true }
  })
  if (!photo || !canViewPhoto(photo, userId)) {
    return NextResponse.json({ error: 'Photo not found' }, { status: 404 })
  }

  // A block has to stop the blocked account writing to the blocker as well as
  // reading them; otherwise it can still comment, and the notification below
  // still lands in the blocker's bell.
  if (await blockedFromInteracting(userId, photo.userId)) {
    return NextResponse.json(
      { error: 'You cannot comment on this photo.' },
      { status: 403 }
    )
  }

  const comment = await prisma.comment.create({
    data: { userId, photoId, content: content.trim() },
    include: { user: { select: bylineUserSelect } }
  })

  // Create notification for photo owner
  if (photo.userId !== userId) {
    await prisma.notification.create({
      data: { type: 'comment', userId: photo.userId, actorId: userId, photoId, commentId: comment.id }
    })
  }

  return NextResponse.json(comment)
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'Sign in to do that' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) {
    return NextResponse.json({ error: 'Missing id' }, { status: 400 })
  }

  const userId = (session.user as { id: string }).id
  // The author may delete a comment, and so may the photographer, from under
  // their own photo. Before, a photographer had to report a rude comment on
  // their own work and wait for a moderator.
  const comment = await prisma.comment.findUnique({
    where: { id },
    select: { userId: true, photo: { select: { userId: true } } },
  })

  if (!comment || (comment.userId !== userId && comment.photo.userId !== userId)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // deleteMany, so a second request racing this one gets a 404, not a 500.
  // The rule is repeated in the delete so it cannot act on a stale read.
  const { count } = await prisma.comment.deleteMany({
    where: { id, OR: [{ userId }, { photo: { userId } }] },
  })
  if (count === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ success: true })
}
