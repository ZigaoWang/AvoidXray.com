import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const tab = searchParams.get('tab') || 'trending'
  const offset = parseInt(searchParams.get('offset') || '0')
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

  // For recent/following, use DB ordering
  if (tab === 'recent' || tab === 'following') {
    const photos = await prisma.photo.findMany({
      where: tab === 'following' && userId ? { userId: { in: followingIds } } : undefined,
      include: { user: true, filmStock: true, camera: true, _count: { select: { likes: true } } },
      orderBy: { createdAt: 'desc' },
      skip: offset,
      take: limit + 1
    })

    const hasMore = photos.length > limit
    return NextResponse.json({
      photos: hasMore ? photos.slice(0, limit) : photos,
      nextOffset: hasMore ? offset + limit : null
    })
  }

  // For trending, fetch all and sort by score (not ideal for large datasets but works for now)
  const allPhotos = await prisma.photo.findMany({
    include: { user: true, filmStock: true, camera: true, _count: { select: { likes: true } } }
  })

  const now = Date.now()
  const sorted = allPhotos
    .map(p => ({
      ...p,
      score: p._count.likes + Math.max(0, 7 - Math.floor((now - new Date(p.createdAt).getTime()) / (1000 * 60 * 60 * 24)))
    }))
    .sort((a, b) => b.score - a.score)
    .slice(offset, offset + limit + 1)

  const hasMore = sorted.length > limit
  return NextResponse.json({
    photos: hasMore ? sorted.slice(0, limit) : sorted,
    nextOffset: hasMore ? offset + limit : null
  })
}
