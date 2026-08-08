import { Prisma } from '@prisma/client'

/**
 * Ordering and filtering for the explore feed.
 *
 * This lives in one place because it previously did not: the page rendered the
 * first screen and /api/photos rendered every screen after it, each with its own
 * copy of the logic. They drifted, so the "popular" tab was ordered by date on
 * the first screen and by likes on the rest — the two orderings disagree, and
 * MasonryGrid's dedupe silently dropped every photo that appeared in both.
 */

export type FeedTab = 'random' | 'recent' | 'popular' | 'following'

export function isFeedTab(value: string | undefined): value is FeedTab {
  return value === 'random' || value === 'recent' || value === 'popular' || value === 'following'
}

/**
 * Ordering for the tabs served through Prisma.
 *
 * Every ordering ends with a unique-ish tiebreaker. Without one, `popular` sorts
 * 786 photos that all have zero likes into an order Postgres is free to vary
 * between queries, which makes offset pagination duplicate and skip rows.
 * `createdAt` then `id` gives a total order that is stable across requests.
 */
export function feedOrderBy(tab: FeedTab): Prisma.PhotoOrderByWithRelationInput[] {
  switch (tab) {
    case 'popular':
      return [{ likes: { _count: 'desc' } }, { createdAt: 'desc' }, { id: 'desc' }]
    case 'recent':
    case 'following':
    default:
      return [{ createdAt: 'desc' }, { id: 'desc' }]
  }
}

/**
 * `following` needs the viewer's follow list; every other tab shows everything
 * published. An empty follow list must still yield an empty feed rather than
 * falling through to "all photos".
 */
export function feedWhere(tab: FeedTab, followingIds: string[]): Prisma.PhotoWhereInput {
  if (tab === 'following') {
    return { published: true, userId: { in: followingIds } }
  }
  return { published: true }
}
