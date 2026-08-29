import { prisma } from '@/lib/db'
import type { Prisma } from '@prisma/client'

/**
 * Who a viewer should not see, and who should not see them.
 *
 * Blocking is stored one-directionally but applied both ways: the blocker
 * stops seeing the blocked account, and the blocked account stops seeing the
 * blocker. Storing it once and expanding here means blocking cannot be used to
 * keep watching someone who has shut you out.
 *
 * Returns an empty list for a signed-out viewer, so public pages skip the query
 * entirely — most requests to this site have no session.
 */
export async function hiddenUserIds(viewerId: string | null | undefined): Promise<string[]> {
  if (!viewerId) return []

  const blocks = await prisma.block.findMany({
    where: { OR: [{ blockerId: viewerId }, { blockedId: viewerId }] },
    select: { blockerId: true, blockedId: true },
  })

  const ids = new Set<string>()
  for (const block of blocks) {
    ids.add(block.blockerId === viewerId ? block.blockedId : block.blockerId)
  }
  return [...ids]
}

/** Whether these two accounts have blocked each other in either direction. */
export async function isBlockedBetween(a: string, b: string): Promise<boolean> {
  const found = await prisma.block.findFirst({
    where: { OR: [{ blockerId: a, blockedId: b }, { blockerId: b, blockedId: a }] },
    select: { id: true },
  })
  return Boolean(found)
}

/**
 * Turns the id list into a `where` fragment for photo queries.
 *
 * Spread into a Prisma filter: `where: { ...PUBLIC_PHOTO, ...hidden }`. An
 * empty list must produce an empty object rather than `{ userId: { notIn: [] } }`
 * — the latter is a filter Postgres has to evaluate for no reason on the
 * overwhelming majority of requests, which have no session at all.
 *
 * Separate from the query below so the shape can be asserted without a
 * database, and so the callers that already hold the id list for their own
 * reasons do not restate the ternary.
 */
export function hiddenFilter(hiddenIds: readonly string[]): Prisma.PhotoWhereInput {
  return hiddenIds.length > 0 ? { userId: { notIn: [...hiddenIds] } } : {}
}

/**
 * The block rule as a ready-made photo filter for `viewerId`.
 *
 * hiddenUserIds returns an array that every call site then had to shape by
 * hand, and the ones that never did are why blocked accounts still appeared on
 * film, camera and search pages while being correctly filtered out of explore.
 */
export async function hiddenPhotoFilter(
  viewerId: string | null | undefined,
): Promise<Prisma.PhotoWhereInput> {
  return hiddenFilter(await hiddenUserIds(viewerId))
}

/**
 * Guard for anything one account aims at another: a follow, a comment, a like.
 *
 * Blocking severed existing follows but nothing stopped the blocked account
 * from immediately following again, commenting on the blocker's photos, or
 * liking them — each of which also pushed a notification. Blocking was a
 * read-side filter only, so it hid the other person from you without stopping
 * them reaching you.
 */
export async function blockedFromInteracting(
  actorId: string,
  targetUserId: string,
): Promise<boolean> {
  if (actorId === targetUserId) return false
  return isBlockedBetween(actorId, targetUserId)
}
