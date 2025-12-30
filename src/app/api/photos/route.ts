import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'

function daysSince(date: Date) {
  return Math.floor((Date.now() - new Date(date).getTime()) / (1000 * 60 * 60 * 24))
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const tab = searchParams.get('tab') || 'trending'
  const cursor = searchParams.get('cursor')
  const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 50)

  const session = await getServerSession(authOptions)
  const userId = (session?.user as { id?: string } | undefined)?.id

  let followingIds: string[] = []
  if (tab === 'following' && userId) {
    const following = await prisma.follow.findMany({
      where: { followerId: userId },
      select: { followingId: true }
    })
    followingIds = following.map(f => f.followingId)
  }

  const photos = await prisma.photo.findMany({
    where: tab === 'following' && userId ? { userId: { in: followingIds } } : undefined,
    include: { user: true, filmStock: true, camera: true, _count: { select: { likes: true } } },
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {})
  })

  let sortedPhotos = [...photos]
  if (tab === 'trending') {
    sortedPhotos = photos.map(p => ({
      ...p,
      score: p._count.likes + Math.max(0, 7 - daysSince(p.createdAt))
    })).sort((a, b) => (b as typeof b & { score: number }).score - (a as typeof a & { score: number }).score)
  } else {
    sortedPhotos.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  }

  const hasMore = sortedPhotos.length > limit
  const returnPhotos = hasMore ? sortedPhotos.slice(0, limit) : sortedPhotos
  const nextCursor = hasMore ? returnPhotos[returnPhotos.length - 1].id : null

  return NextResponse.json({
    photos: returnPhotos,
    nextCursor
  })
}
