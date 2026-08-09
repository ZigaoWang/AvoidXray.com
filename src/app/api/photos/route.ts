import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { bylineUserSelect } from '@/lib/publicUser'
import { feedOrderBy, feedWhere, isFeedTab, parseFeedScope, type FeedTab } from '@/lib/photoFeed'
import { dailySeed } from '@/lib/seededShuffle'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const rawTab = searchParams.get('tab') || 'random'
  const activeTab: FeedTab = isFeedTab(rawTab) ? rawTab : 'random'
  const offset = parseInt(searchParams.get('offset') || '0')
  const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 50)

  const session = await getServerSession(authOptions)
  const userId = (session?.user as { id?: string } | undefined)?.id

  let followingIds: string[] = []
  if (activeTab === 'following' && userId) {
    const following = await prisma.follow.findMany({
      where: { followerId: userId },
      select: { followingId: true }
    })
    followingIds = following.map(f => f.followingId)
  }

  // Shared with the pages so the first screen and the pages after it cannot
  // filter differently. The scope narrows the feed to one film, camera,
  // photographer or album, which is how the hub grids paginate.
  const scope = parseFeedScope(searchParams)
  const where = feedWhere(activeTab, followingIds, scope)

  // Counted only for the first page: callers need it to label a filtered view,
  // and repeating it for every page would be wasted work.
  const total = offset === 0 ? await prisma.photo.count({ where }) : undefined

  // Random: ordered by the seed the page rendered with, so continuing to scroll
  // stays in the same shuffle. Falls back to a day-stable seed for callers that
  // do not supply one, which keeps their pagination self-consistent.
  if (activeTab === 'random') {
    const requested = Number(searchParams.get('seed'))
    const seed = Number.isFinite(requested) && requested > 0 ? Math.floor(requested) : dailySeed()

    const photos = await prisma.$queryRaw`
      SELECT p.*,
             json_build_object('username', u.username, 'name', u.name, 'avatar', u.avatar) as user,
             CASE WHEN f.id IS NULL THEN NULL
                  ELSE json_build_object('name', f.name, 'brand', f.brand, 'slug', f.slug) END as "filmStock",
             CASE WHEN c.id IS NULL THEN NULL
                  ELSE json_build_object('name', c.name, 'brand', c.brand, 'slug', c.slug) END as camera,
             (SELECT COUNT(*)::int FROM "Like" WHERE "photoId" = p.id) as likes_count
      FROM "Photo" p
      LEFT JOIN "User" u ON p."userId" = u.id
      LEFT JOIN "FilmStock" f ON p."filmStockId" = f.id
      LEFT JOIN "Camera" c ON p."cameraId" = c.id
      WHERE p.published = true
        AND (${scope.filmStockId ?? null}::text IS NULL OR p."filmStockId" = ${scope.filmStockId ?? null})
        AND (${scope.cameraId ?? null}::text IS NULL OR p."cameraId" = ${scope.cameraId ?? null})
        AND (${scope.username ?? null}::text IS NULL OR u.username = ${scope.username ?? null})
      ORDER BY md5(p.id || ${seed})
      LIMIT ${limit + 1} OFFSET ${offset}
    ` as any[]

    // The CASE WHEN above already yields SQL NULL for missing relations, so the
    // values arrive as real nulls rather than the string 'null'.
    const transformed = photos.map(p => ({
      ...p,
      _count: { likes: p.likes_count }
    }))

    const hasMore = transformed.length > limit
    return NextResponse.json({
      photos: hasMore ? transformed.slice(0, limit) : transformed,
      nextOffset: hasMore ? offset + limit : null,
      total
    })
  }

  // Popular: order by likes count
  if (activeTab === 'popular') {
    const photos = await prisma.photo.findMany({
      where,
      include: { user: { select: bylineUserSelect }, filmStock: true, camera: true, _count: { select: { likes: true } } },
      orderBy: feedOrderBy('popular'),
      skip: offset,
      take: limit + 1
    })

    const hasMore = photos.length > limit
    return NextResponse.json({
      photos: hasMore ? photos.slice(0, limit) : photos,
      nextOffset: hasMore ? offset + limit : null,
      total
    })
  }

  // Recent/Following: order by createdAt
  const photos = await prisma.photo.findMany({
    where,
    include: { user: { select: bylineUserSelect }, filmStock: true, camera: true, _count: { select: { likes: true } } },
    orderBy: feedOrderBy(activeTab),
    skip: offset,
    take: limit + 1
  })

  const hasMore = photos.length > limit
  return NextResponse.json({
    photos: hasMore ? photos.slice(0, limit) : photos,
    nextOffset: hasMore ? offset + limit : null,
    total
  })
}
