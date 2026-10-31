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
 *
 * The same constants keep archive photographs out. Those are reference
 * material imported from public archives, owned by no account, and everything
 * built on these filters (feeds, profiles, counts, search, hub grids) is about
 * what the community has posted. A query that wants archive photos asks for
 * them by kind.
 */

/**
 * Community uploads of any visibility, for counts that report on the site's
 * own activity, such as the admin dashboard. Archive photos are not activity.
 */
export const COMMUNITY_PHOTO = { kind: 'COMMUNITY' } as const satisfies Prisma.PhotoWhereInput

/**
 * The filter for anything a stranger can see.
 *
 * `screening` is the automatic nudity check. A new upload is public only once
 * it has passed, so a photo that gets held was never shown in the meantime.
 * A photo in its owner's trash is gone from every surface, theirs included.
 */
export const PUBLIC_PHOTO = {
  ...COMMUNITY_PHOTO,
  uploadComplete: true,
  deletedAt: null,
  visibility: 'PUBLIC',
  screening: 'CLEAR',
} as const satisfies Prisma.PhotoWhereInput

/**
 * Archive photographs anyone may see: imported in full. Asked for by kind,
 * on the Collections pages only, never mixed into a community surface.
 */
export const PUBLIC_ARCHIVE_PHOTO = {
  kind: 'ARCHIVE',
  uploadComplete: true,
  deletedAt: null,
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
    ...COMMUNITY_PHOTO,
    uploadComplete: true,
    deletedAt: null,
    OR: [{ visibility: 'PUBLIC', screening: 'CLEAR' }, { userId: viewerId }],
  }
}

/** The columns the checks below read. */
export type ViewablePhoto = {
  kind: string
  userId: string | null
  uploadComplete: boolean
  visibility: string
  screening: string
  deletedAt: Date | null
}

/**
 * Whether a already-loaded photo may be shown to this viewer as a community
 * photo: liked, commented on, exported, counted. Never true of an archive
 * photo, which has its own page and none of those.
 *
 * A type guard, so a caller that passed it can use `photo.userId` as the
 * owner: only community photos pass, and Photo_owner_matches_kind guarantees
 * every one of those has an owner.
 */
export function canViewPhoto<P extends ViewablePhoto>(
  photo: P,
  viewerId: string | null | undefined
): photo is P & { userId: string } {
  if (photo.kind !== 'COMMUNITY') return false
  if (!photo.uploadComplete || photo.deletedAt) return false
  if (photo.visibility === 'PUBLIC' && photo.screening === 'CLEAR') return true
  return viewerId != null && photo.userId === viewerId
}

/**
 * Whether this viewer may open the photo's own page. Wider than canViewPhoto,
 * which still decides everything else about the photo: its owner can open an
 * upload that never finished publishing, and an admin can open any photo, since
 * the admin tables list drafts and private frames and their links led to a 404.
 *
 * A published archive photo is open to everyone: its page is where its
 * provenance is shown.
 */
export function canOpenPhotoPage(
  photo: ViewablePhoto,
  viewer: { id: string; isAdmin: boolean } | null
): boolean {
  if (photo.kind === 'ARCHIVE') return photo.uploadComplete || viewer?.isAdmin === true
  if (canViewPhoto(photo, viewer?.id)) return true
  if (!viewer) return false
  // From the trash, a photo opens only for its owner, who may restore it, and
  // for admins handling a report about it.
  return viewer.isAdmin || photo.userId === viewer.id
}
