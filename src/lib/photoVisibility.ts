import { Prisma } from '@prisma/client'

/**
 * Who is allowed to see a photo.
 *
 * Albums could be private long before photos could. A photo in a private album
 * still appeared in explore, on its owner's profile, on film and camera pages,
 * in search and in the sitemap — so the only way to take one out of public view
 * was to delete it, which removed it from everywhere at once. That is the bug
 * this exists to close.
 *
 * `published` cannot express this. It means "the upload finished", and
 * /api/upload/cleanup deletes unpublished photos an hour after they are
 * created; parking a photo there would destroy it rather than hide it.
 *
 * Every query that renders photos to someone other than their owner should
 * spread PUBLIC_PHOTO. Keeping the rule in one constant is the point: there
 * are around forty such queries, and a privacy rule that has to be remembered
 * forty times is one that will eventually be forgotten.
 */

/** The filter for anything a stranger can see. */
export const PUBLIC_PHOTO = {
  published: true,
  visibility: 'PUBLIC',
} as const satisfies Prisma.PhotoWhereInput

/**
 * The filter for a feed being rendered *for* `viewerId`.
 *
 * A signed-in person browsing their own profile should see their private
 * photos there; a stranger on the same profile should not. Passing null or
 * undefined gives the strictly public view.
 */
export function visibleToViewer(viewerId: string | null | undefined): Prisma.PhotoWhereInput {
  if (!viewerId) return { ...PUBLIC_PHOTO }
  return {
    published: true,
    OR: [{ visibility: 'PUBLIC' }, { userId: viewerId }],
  }
}

/** Whether a already-loaded photo may be shown to this viewer. */
export function canViewPhoto(
  photo: { userId: string; published: boolean; visibility: string },
  viewerId: string | null | undefined
): boolean {
  if (!photo.published) return false
  if (photo.visibility === 'PUBLIC') return true
  return photo.userId === viewerId
}
