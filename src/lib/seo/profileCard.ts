import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/db'

/**
 * Drops the cached profile preview card for the owners of photos that just
 * left public view.
 *
 * The card is a collage of the owner's public photos, cached for an hour. A
 * photo made private or deleted stayed in it until the cache ran out, so a
 * link shared in that window still showed it. Marking the profile path stale
 * costs nothing until somebody next asks for it.
 *
 * Never throws: the change it follows has already been made and reported.
 */
export async function refreshProfileCards(userIds: Iterable<string>): Promise<void> {
  const ids = [...new Set(userIds)]
  if (ids.length === 0) return
  try {
    const users = await prisma.user.findMany({ where: { id: { in: ids } }, select: { username: true } })
    for (const { username } of users) {
      // 'layout' so the opengraph-image route under the profile goes too.
      if (username) revalidatePath(`/${username}`, 'layout')
    }
  } catch (error) {
    console.error('[og] could not refresh profile cards', error)
  }
}
