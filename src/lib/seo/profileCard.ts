import { revalidatePath, revalidateTag } from 'next/cache'
import { prisma } from '@/lib/db'
import { PHOTOS_TAG } from '@/lib/publicCache'

/**
 * Drops every cached preview card a photo that just left public view could be
 * in: its owner's profile card, the film and camera cards, the site's own
 * card, and the home page's cached photo pool.
 *
 * Each is a collage of public photos cached for an hour or a day. A photo made
 * private or deleted stayed in them until the cache ran out, so a link shared
 * in that window still showed it. Film and camera cards are dropped all at
 * once rather than by the photo's film and camera: which cards a photo is in
 * is decided by queries this cannot cheaply repeat, and marking a path stale
 * costs nothing until somebody next asks for it.
 *
 * Never throws: the change it follows has already been made and reported.
 */
export async function refreshPublicCards(userIds: Iterable<string>): Promise<void> {
  const ids = [...new Set(userIds)]
  if (ids.length === 0) return
  try {
    // The home page's cached collage and counts, which would otherwise show
    // the photo for up to five more minutes. Expired outright rather than
    // 'max': under 'max' the next visitor is still served the stale pool, so
    // the photo would show once more after its owner hid it.
    revalidateTag(PHOTOS_TAG, { expire: 0 })
    revalidatePath('/films/[id]', 'layout')
    revalidatePath('/cameras/[id]', 'layout')
    revalidatePath('/opengraph-image')
    revalidatePath('/twitter-image')
    const users = await prisma.user.findMany({ where: { id: { in: ids } }, select: { username: true } })
    for (const { username } of users) {
      // 'layout' so the opengraph-image route under the profile goes too.
      if (username) revalidatePath(`/${username}`, 'layout')
    }
  } catch (error) {
    console.error('[og] could not refresh profile cards', error)
  }
}
