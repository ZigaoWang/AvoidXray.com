import { prisma } from '@/lib/db'
import { bylineUserSelect } from '@/lib/publicUser'
import { withLikeCounts, withViewerLikes } from '@/lib/counts'
import {
  FEED_FIRST_PAGE,
  feedOrderBy,
  feedScopeSql,
  feedWhere,
  RANDOM_FEED_SELECT,
  type FeedScope,
  type FeedTab,
  type RandomFeedRow,
} from '@/lib/photoFeed'

/**
 * The orders a scoped photo grid offers: a film's, a camera's, a pairing's.
 *
 * The three Explore offers, minus Following, which narrows by person rather
 * than ordering. Named and worded as Explore names them, so one control reads
 * the same wherever it appears.
 */
export const SAMPLE_ORDERS = ['random', 'recent', 'popular'] as const satisfies readonly FeedTab[]
export type SampleOrder = (typeof SAMPLE_ORDERS)[number]

export const SAMPLE_ORDER_LABELS: Record<SampleOrder, string> = {
  random: 'Random',
  recent: 'Recent',
  popular: 'Popular',
}

/**
 * Random unless the reader asked for another.
 *
 * The gear pages were newest first and nothing else, so the top of a film's
 * page was whoever uploaded last, usually one roll from one person, and a
 * stock shot by forty photographers read as one. Random is Explore's default
 * for the same reason.
 */
export function toSampleOrder(value: string | undefined): SampleOrder {
  return SAMPLE_ORDERS.find(order => order === value) ?? 'random'
}

/**
 * The first screen of a scoped grid, in the order requested.
 *
 * The same queries /api/photos runs for every page after it, so the first
 * screen and the rest come from one ordering. Each gear page used to carry its
 * own copy of a newest-first query, which is why none of them could offer any
 * other order: MasonryGrid would have paged a different one after it.
 */
export async function scopedFirstPage({
  scope,
  order,
  seed,
  hidden,
  viewerId,
}: {
  scope: FeedScope
  order: SampleOrder
  /** Required for `random`; the grid forwards it so scrolling stays in one shuffle. */
  seed: number
  /** Accounts blocked in either direction. */
  hidden: string[]
  viewerId?: string
}) {
  const take = FEED_FIRST_PAGE + 1

  const rows =
    order === 'random'
      ? ((await prisma.$queryRaw`
          ${RANDOM_FEED_SELECT}
          WHERE p.published = true AND p.visibility = 'public' AND p.screening = 'clear'
            AND (${hidden.length === 0} OR p."userId" <> ALL(${hidden}))
            ${feedScopeSql(scope)}
          ORDER BY md5(p.id || ${seed})
          LIMIT ${take}
        `) as RandomFeedRow[])
      : await prisma.photo.findMany({
          where: feedWhere(order, [], scope, hidden),
          include: {
            user: { select: bylineUserSelect },
            filmStock: { select: { name: true, brand: true, manufacturer: true, slug: true } },
            camera: { select: { name: true, brand: true, slug: true } },
          },
          orderBy: feedOrderBy(order),
          take,
        })

  const hasMore = rows.length > FEED_FIRST_PAGE
  const page = hasMore ? rows.slice(0, FEED_FIRST_PAGE) : rows
  const photos = await withViewerLikes(await withLikeCounts(page), viewerId)

  return { photos, nextOffset: hasMore ? FEED_FIRST_PAGE : null }
}
