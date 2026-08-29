import { prisma } from '@/lib/db'

/**
 * What can be reported, and how each kind is resolved for review.
 *
 * Reports are polymorphic — a photo, a comment, a person or a community note —
 * so the queue has to turn `(targetType, targetId)` back into something a
 * moderator can look at. Keeping that here means the admin view and the report
 * endpoint agree on what a valid target is, and adding a fifth kind is one
 * entry rather than edits in three files.
 */

export const REPORT_TARGETS = ['photo', 'comment', 'user', 'note'] as const
export type ReportTarget = (typeof REPORT_TARGETS)[number]

/**
 * What each target is called in front of a reader.
 *
 * The menu item used to say only "Report", and on a photo page that menu sits
 * in the author's card next to Block. "Report" there could mean the photo or
 * the person, and the two go to different places. Every item names its target
 * instead, so nothing has to be inferred from where the menu happens to be.
 *
 * "user" is the column value; nobody says "report this user" about a person
 * whose profile they are looking at, so the word shown is "account".
 */
export const REPORT_TARGET_NOUNS: Record<ReportTarget, string> = {
  photo: 'photo',
  comment: 'comment',
  user: 'account',
  note: 'note',
}

export function isReportTarget(value: unknown): value is ReportTarget {
  return typeof value === 'string' && (REPORT_TARGETS as readonly string[]).includes(value)
}

export const REPORT_REASONS = [
  { value: 'SPAM', label: 'Spam or advertising' },
  { value: 'NOT_FILM', label: 'Not a film photograph' },
  { value: 'INAPPROPRIATE', label: 'Inappropriate content' },
  { value: 'HARASSMENT', label: 'Harassment or abuse' },
  { value: 'COPYRIGHT', label: "Someone else's work" },
  { value: 'OTHER', label: 'Something else' },
] as const

export type ReportReasonValue = (typeof REPORT_REASONS)[number]['value']

export function isReportReason(value: unknown): value is ReportReasonValue {
  return typeof value === 'string' && REPORT_REASONS.some(r => r.value === value)
}

/** Whether the thing being reported exists, so the queue cannot fill with noise. */
export async function targetExists(type: ReportTarget, id: string): Promise<boolean> {
  switch (type) {
    case 'photo': return Boolean(await prisma.photo.findUnique({ where: { id }, select: { id: true } }))
    case 'comment': return Boolean(await prisma.comment.findUnique({ where: { id }, select: { id: true } }))
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
        owner: photo.user.username,
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
