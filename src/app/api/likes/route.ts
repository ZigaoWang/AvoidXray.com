import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { isUniqueViolation } from '@/lib/prismaErrors'

export async function GET(req: NextRequest) {
  const photoId = req.nextUrl.searchParams.get('photoId')
  if (!photoId) return NextResponse.json({ error: 'Missing photoId' }, { status: 400 })

  const likes = await prisma.like.findMany({
    where: { photoId },
    include: { user: { select: { username: true, name: true, avatar: true } } },
    orderBy: { createdAt: 'desc' }
  })

  return NextResponse.json(likes.map(l => l.user))
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { photoId } = await req.json()
  if (typeof photoId !== 'string' || !photoId) {
    return NextResponse.json({ error: 'Missing photoId' }, { status: 400 })
  }
  const userId = (session.user as { id: string }).id

  // Only published photos are likeable, and this also rejects a photoId that
  // does not exist — previously that reached the insert and failed the foreign
  // key check as an unhandled 500.
  const photo = await prisma.photo.findUnique({
    where: { id: photoId },
    select: { userId: true, published: true }
  })
  if (!photo || !photo.published) {
    return NextResponse.json({ error: 'Photo not found' }, { status: 404 })
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
