import { prisma } from '@/lib/db'

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
