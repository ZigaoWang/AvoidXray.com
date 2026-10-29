import { prisma } from '@/lib/db'
import { canViewPhoto } from './photoVisibility'
import { type ReportTarget } from './reportTypes'

/**
 * Turning a report's `(targetType, targetId)` back into something a moderator
 * can look at.
 *
 * Server only: this queries the database. The constants and type guards a
 * client component needs are in reportTypes.ts, and are re-exported here so
 * server callers can keep importing from one place.
 */

export * from './reportTypes'

const VIEWABLE = { kind: true, userId: true, uploadComplete: true, visibility: true, screening: true, deletedAt: true } as const

/**
 * Whether this person can report the thing, so the queue cannot fill with
 * noise: it exists, and they can see it. A private photo, or a comment on one,
 * gets the same answer as an id that does not exist; otherwise the answer
 * would tell a stranger which private photo ids are real.
 */
export async function canReport(type: ReportTarget, id: string, reporterId: string): Promise<boolean> {
  switch (type) {
    case 'photo': {
      const photo = await prisma.photo.findUnique({ where: { id }, select: VIEWABLE })
      return photo !== null && canViewPhoto(photo, reporterId)
    }
    case 'comment': {
      const comment = await prisma.comment.findUnique({ where: { id }, select: { photo: { select: VIEWABLE } } })
      return comment !== null && canViewPhoto(comment.photo, reporterId)
    }
    case 'user': return Boolean(await prisma.user.findUnique({ where: { id }, select: { id: true } }))
    case 'note': return Boolean(await prisma.communityNote.findUnique({ where: { id }, select: { id: true } }))
  }
}

export interface ResolvedTarget {
  /** Short description of the thing, for the queue. */
  summary: string
  /** Where a moderator goes to see it, or null if it no longer exists. */
  href: string | null
  /** Who made it, if known. */
  owner: string | null
  exists: boolean
}

/**
 * Turns a stored target back into something reviewable.
 *
 * A polymorphic reference cannot have a foreign key, so the thing reported may
 * have been deleted since. That is reported plainly rather than shown as a
 * broken row: "no longer exists" is itself a useful outcome for a moderator.
 */
export async function resolveTarget(type: ReportTarget, id: string): Promise<ResolvedTarget> {
  const missing: ResolvedTarget = { summary: 'Deleted', href: null, owner: null, exists: false }

  switch (type) {
    case 'photo': {
      const photo = await prisma.photo.findUnique({
        where: { id },
        select: { id: true, caption: true, user: { select: { username: true } } },
      })
      if (!photo) return missing
      return {
        summary: photo.caption?.slice(0, 80) || 'Untitled photo',
        href: `/photos/${photo.id}`,
        owner: photo.user?.username ?? null,
        exists: true,
      }
    }
    case 'comment': {
      const comment = await prisma.comment.findUnique({
        where: { id },
        select: { content: true, photoId: true, user: { select: { username: true } } },
      })
      if (!comment) return missing
      return {
        summary: comment.content.slice(0, 120),
        href: `/photos/${comment.photoId}`,
        owner: comment.user.username,
        exists: true,
      }
    }
    case 'user': {
      const user = await prisma.user.findUnique({ where: { id }, select: { username: true, name: true } })
      if (!user) return missing
      return {
        summary: user.name ? `${user.name} (@${user.username})` : `@${user.username}`,
        href: `/${user.username}`,
        owner: user.username,
        exists: true,
      }
    }
    case 'note': {
      const note = await prisma.communityNote.findUnique({
        where: { id },
        select: { content: true, targetType: true, targetId: true, user: { select: { username: true } } },
      })
      if (!note) return missing
      return {
        summary: note.content.slice(0, 120),
        href: note.targetType === 'camera' ? `/cameras/${note.targetId}` : `/films/${note.targetId}`,
        owner: note.user.username,
        exists: true,
      }
    }
  }
}
