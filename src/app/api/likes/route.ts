import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { isUniqueViolation } from '@/lib/prismaErrors'
import { canViewPhoto } from '@/lib/photoVisibility'
import { bylineUserSelect } from '@/lib/publicUser'
import { enforceLimit } from '@/lib/rateLimit'
import { LIMITS } from '@/lib/rateLimitPolicy'
import { readJsonObject, invalidBody } from '@/lib/requestBody'
import { blockedFromInteracting } from '@/lib/blocks'

export async function GET(req: NextRequest) {
  const photoId = req.nextUrl.searchParams.get('photoId')
  if (!photoId) return NextResponse.json({ error: 'Missing photoId' }, { status: 400 })

  // Who liked a photo is only answerable to someone who can see the photo.
  // Unguarded, this reported the audience for a private photo to anyone.
  const session = await getServerSession(authOptions)
  const viewerId = (session?.user as { id?: string } | undefined)?.id ?? null

  const photo = await prisma.photo.findUnique({
    where: { id: photoId },
    select: { userId: true, published: true, visibility: true }
  })
  if (!photo || !canViewPhoto(photo, viewerId)) {
    return NextResponse.json({ error: 'Photo not found' }, { status: 404 })
  }

  const likes = await prisma.like.findMany({
    where: { photoId },
    include: { user: { select: bylineUserSelect } },
    orderBy: { createdAt: 'desc' }
  })

  return NextResponse.json(likes.map(l => l.user))
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await readJsonObject(req)

  if (!body) return invalidBody()

  const { photoId } = body
  if (typeof photoId !== 'string' || !photoId) {
    return NextResponse.json({ error: 'Missing photoId' }, { status: 400 })
  }
  const userId = (session.user as { id: string }).id

  const limited = enforceLimit(
    'like', userId, LIMITS.reaction.perUser,
    'Too many likes in a short time. Please wait a moment.'
  )
  if (limited) return limited

  // You can only like what you can see, which also rejects a photoId that does
  // not exist — previously that reached the insert and failed the foreign key
  // check as an unhandled 500. Checking `published` alone left a private photo
  // likeable, which both confirmed it existed and notified its owner.
  const photo = await prisma.photo.findUnique({
    where: { id: photoId },
    select: { userId: true, published: true, visibility: true }
  })
  if (!photo || !canViewPhoto(photo, userId)) {
    return NextResponse.json({ error: 'Photo not found' }, { status: 404 })
  }

  // Same rule as comments: a like notifies the owner, so a blocked account
  // must not be able to send one.
  if (await blockedFromInteracting(userId, photo.userId)) {
    return NextResponse.json({ error: 'You cannot like this photo.' }, { status: 403 })
  }

  const existing = await prisma.like.findUnique({
    where: { userId_photoId: { userId, photoId } }
  })

  if (existing) {
    // deleteMany rather than delete: a concurrent unlike may already have
    // removed the row, and delete throws when the record is gone.
    await prisma.like.deleteMany({ where: { userId, photoId } })
    return NextResponse.json({ liked: false })
  }

  try {
    await prisma.like.create({ data: { userId, photoId } })
  } catch (error) {
    // Another request for the same user/photo won the race. The like exists,
    // which is the outcome the caller asked for.
    if (!isUniqueViolation(error)) throw error
    return NextResponse.json({ liked: true })
  }

  if (photo.userId !== userId) {
    await prisma.notification.create({
      data: { type: 'like', userId: photo.userId, actorId: userId, photoId }
    })
  }

  return NextResponse.json({ liked: true })
}
