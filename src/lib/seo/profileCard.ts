import { revalidatePath, revalidateTag } from 'next/cache'
import { prisma } from '@/lib/db'
import { PHOTOS_TAG } from '@/lib/publicCache'

/**
 * Drops the cached profile preview card for the owners of photos that just
 * left public view, and the home page's cached photo pool with it.
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
    // The home page's cached collage and counts, which would otherwise show
    // the photo for up to five more minutes. Expired outright rather than
    // 'max': under 'max' the next visitor is still served the stale pool, so
    // the photo would show once more after its owner hid it.
    revalidateTag(PHOTOS_TAG, { expire: 0 })
    const users = await prisma.user.findMany({ where: { id: { in: ids } }, select: { username: true } })
    for (const { username } of users) {
      // 'layout' so the opengraph-image route under the profile goes too.
      if (username) revalidatePath(`/${username}`, 'layout')
    }
  } catch (error) {
    console.error('[og] could not refresh profile cards', error)
  }
}
