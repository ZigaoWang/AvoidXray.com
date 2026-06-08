import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'

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
  const userId = (session.user as { id: string }).id

  const existing = await prisma.like.findUnique({
    where: { userId_photoId: { userId, photoId } }
  })

  if (existing) {
    await prisma.like.delete({ where: { id: existing.id } })
    return NextResponse.json({ liked: false })
  } else {
    await prisma.like.create({ data: { userId, photoId } })

    // Create notification for photo owner
    const photo = await prisma.photo.findUnique({ where: { id: photoId }, select: { userId: true } })
    if (photo && photo.userId !== userId) {
      await prisma.notification.create({
        data: { type: 'like', userId: photo.userId, actorId: userId, photoId }
      })
    }

    return NextResponse.json({ liked: true })
  }
}
