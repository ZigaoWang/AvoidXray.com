import { after } from 'next/server'
import type { PhotoVisibility } from '@prisma/client'
import { syncStorageAfterVisibilityChange } from './photoStorage'
import { refreshPublicCards } from './seo/profileCard'

/** The columns a photo's stored files are found by, for selecting before a delete. */
export const PHOTO_FILE_KEYS = { originalKey: true, thumbKey: true, mediumKey: true, largeKey: true } as const

/**
 * Everything that has to follow a change of visibility, once the rows are
 * saved. Every path that changes visibility calls this: the owner's edit, the
 * bulk edit and the admin tables. Call it from a request; the file moves run
 * after the response.
 *
 * Going private, cached cards are dropped before the response, since they are
 * what still shows the photo. The files are moved after it: a bulk change can
 * mean hundreds of copies, which is no reason to keep someone waiting, and the
 * photo is already out of every listing. A move that fails there is finished
 * by the hourly sweep. Going public the cards have nothing to drop, and until
 * the files are readable, pages load the photo through the signed route, which
 * lets anyone through once the row says public.
 */
export async function afterVisibilityChange(
  photos: { id: string; userId: string | null }[],
  visibility: PhotoVisibility
): Promise<void> {
  if (photos.length === 0) return
  if (visibility === 'PRIVATE') {
    await refreshPublicCards(photos.flatMap(p => (p.userId ? [p.userId] : [])))
  }
  const ids = photos.map(p => p.id)
  after(() => syncStorageAfterVisibilityChange(ids))
}
