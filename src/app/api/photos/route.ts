import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { bylineUserSelect } from '@/lib/publicUser'
import { feedOrderBy, feedScopeSql, feedWhere, isFeedTab, parseFeedScope, resolveScopeAccess, RANDOM_FEED_SELECT, type FeedTab, type RandomFeedRow } from '@/lib/photoFeed'
import { withLikeCounts } from '@/lib/counts'
import { dailySeed } from '@/lib/seededShuffle'
import { parseIntParam } from '@/lib/validation'
import { hiddenUserIds } from '@/lib/blocks'

/**
 * Ceiling on how far a caller may page into a feed.
 *
 * Well past anything reachable by scrolling, and far enough from the numbers
 * Postgres struggles with that a deliberately huge offset cannot be used to
 * make the database do unbounded work.
 */
const MAX_FEED_OFFSET = 100_000

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const rawTab = searchParams.get('tab') || 'random'
  const activeTab: FeedTab = isFeedTab(rawTab) ? rawTab : 'random'
  // Bounded here rather than trusted: these become `skip` and `take`.
  const offset = parseIntParam(searchParams.get('offset'), { fallback: 0, max: MAX_FEED_OFFSET })
  const limit = parseIntParam(searchParams.get('limit'), { fallback: 20, min: 1, max: 50 })

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

  // A feed narrowed to one photographer, or to an album, may include that
  // person's private photos — but only when they are the one asking. Every
  // other feed stays strictly public, so private photos cannot leak into
  // explore or a film or camera page.
  const access = await resolveScopeAccess(scope, userId)
  if (!access.allowed) {
    return NextResponse.json({ photos: [], nextOffset: null, total: 0 })
  }
  const ownerViewingId = access.owner
  // Blocked in either direction, so neither party appears in the other's feed.
  const hidden = await hiddenUserIds(userId)
  const where = feedWhere(activeTab, followingIds, scope, hidden, ownerViewingId)

  // Counted only for the first page: callers need it to label a filtered view,
  // and repeating it for every page would be wasted work.
  const total = offset === 0 ? await prisma.photo.count({ where }) : undefined

  // Random: ordered by the seed the page rendered with, so continuing to scroll
  // stays in the same shuffle. Falls back to a day-stable seed for callers that
  // do not supply one, which keeps their pagination self-consistent.
  if (activeTab === 'random') {
    const requested = Number(searchParams.get('seed'))
    const seed = Number.isFinite(requested) && requested > 0 ? Math.floor(requested) : dailySeed()

    const rows = await prisma.$queryRaw`
      ${RANDOM_FEED_SELECT}
      WHERE p.published = true
        AND (p.visibility = 'public' OR p."userId" = ${ownerViewingId ?? null})
        AND (${hidden.length === 0} OR p."userId" <> ALL(${hidden}))
        ${feedScopeSql(scope)}
      ORDER BY md5(p.id || ${seed})
      LIMIT ${limit + 1} OFFSET ${offset}
    ` as RandomFeedRow[]

    // Counted after the page is trimmed, so the extra row fetched only to
    // answer has-more is not counted and then thrown away.
    const hasMore = rows.length > limit
    return NextResponse.json({
      photos: await withLikeCounts(hasMore ? rows.slice(0, limit) : rows),
      nextOffset: hasMore ? offset + limit : null,
      total
    })
  }

  // Recent, popular and following differ only in their ordering, which
  // feedOrderBy carries, so they share one query rather than holding a copy
  // each of the same include.
  const rows = await prisma.photo.findMany({
    where,
    include: {
      user: { select: bylineUserSelect },
      // Narrowed to what the grid reads. `filmStock: true, camera: true`
      // shipped all 33 and 41 columns per photo, summary and the
      // multi-paragraph description included, thirty times a scroll page --
      // about nine times the bytes for the same rendering. `manufacturer` is
      // in the list because displayName prefers it over brand for a film, and
      // dropping it would quietly change the alt text, which is the only
      // thing describing a scan to an image crawler.
      filmStock: { select: { name: true, brand: true, manufacturer: true } },
      camera: { select: { name: true, brand: true } },
    },
    orderBy: feedOrderBy(activeTab),
    skip: offset,
    take: limit + 1
  })

  const hasMore = rows.length > limit
  return NextResponse.json({
    photos: await withLikeCounts(hasMore ? rows.slice(0, limit) : rows),
    nextOffset: hasMore ? offset + limit : null,
    total
  })
}
