import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const tab = searchParams.get('tab') || 'random'
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

  // Build where clause
  const where = {
    published: true,
    ...(tab === 'following' && userId ? { userId: { in: followingIds } } : {})
  }

  // Random: use seed-based random ordering
  if (tab === 'random') {
    const seed = Math.floor(Date.now() / (1000 * 60 * 60 * 24)) // Changes daily

    const photos = await prisma.$queryRaw`
      SELECT p.*,
             json_build_object('username', u.username) as user,
             COALESCE(json_build_object('name', f.name), 'null'::json) as "filmStock",
             COALESCE(json_build_object('name', c.name), 'null'::json) as camera,
             (SELECT COUNT(*)::int FROM "Like" WHERE "photoId" = p.id) as likes_count
      FROM "Photo" p
      LEFT JOIN "User" u ON p."userId" = u.id
      LEFT JOIN "FilmStock" f ON p."filmStockId" = f.id
      LEFT JOIN "Camera" c ON p."cameraId" = c.id
      WHERE p.published = true
      ORDER BY md5(p.id || ${seed})
      LIMIT ${limit + 1} OFFSET ${offset}
    ` as any[]

    const transformed = photos.map(p => ({
      ...p,
      filmStock: p.filmStock === 'null' ? null : p.filmStock,
      camera: p.camera === 'null' ? null : p.camera,
      _count: { likes: p.likes_count }
    }))

    const hasMore = transformed.length > limit
    return NextResponse.json({
      photos: hasMore ? transformed.slice(0, limit) : transformed,
      nextOffset: hasMore ? offset + limit : null
    })
  }

  // Popular: order by likes count
  if (tab === 'popular') {
    const photos = await prisma.photo.findMany({
      where,
      include: { user: true, filmStock: true, camera: true, _count: { select: { likes: true } } },
      orderBy: { likes: { _count: 'desc' } },
      skip: offset,
      take: limit + 1
    })

    const hasMore = photos.length > limit
    return NextResponse.json({
      photos: hasMore ? photos.slice(0, limit) : photos,
      nextOffset: hasMore ? offset + limit : null
    })
  }

  // Recent/Following: order by createdAt
  const photos = await prisma.photo.findMany({
    where,
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
