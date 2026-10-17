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

/**
 * The filter for anything a stranger can see.
 *
 * `screening` is the automatic nudity check. A new upload is public only once
 * it has passed, so a photo that gets held was never shown in the meantime.
 */
export const PUBLIC_PHOTO = {
  published: true,
  visibility: 'PUBLIC',
  screening: 'CLEAR',
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
    OR: [{ visibility: 'PUBLIC', screening: 'CLEAR' }, { userId: viewerId }],
  }
}

/** The columns the checks below read. */
export type ViewablePhoto = { userId: string; published: boolean; visibility: string; screening: string }

/** Whether a already-loaded photo may be shown to this viewer. */
export function canViewPhoto(
  photo: ViewablePhoto,
  viewerId: string | null | undefined
): boolean {
  if (!photo.published) return false
  if (photo.visibility === 'PUBLIC' && photo.screening === 'CLEAR') return true
  return photo.userId === viewerId
}

/**
 * Whether this viewer may open the photo's own page. Wider than canViewPhoto,
 * which still decides everything else about the photo: its owner can open an
 * upload that never finished publishing, and an admin can open any photo, since
 * the admin tables list drafts and private frames and their links led to a 404.
 */
export function canOpenPhotoPage(
  photo: ViewablePhoto,
  viewer: { id: string; isAdmin: boolean } | null
): boolean {
  if (canViewPhoto(photo, viewer?.id)) return true
  if (!viewer) return false
  return viewer.isAdmin || photo.userId === viewer.id
}
