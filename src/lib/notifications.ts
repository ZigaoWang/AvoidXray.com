import { prisma } from '@/lib/db'

/**
 * What a notification is about. The last four are from the site rather than
 * a person: the nudity check holding a photo, and an admin's decision on it.
 * Their actor is the photo's owner, since the column is required and there is
 * no person to name.
 */
export type NotificationType = 'like' | 'comment' | 'follow' | 'held' | 'approved' | 'rejected' | 'deleted'

/** Rows read to fill one page of groups. */
const ROWS_READ = 100

export interface NotificationRow {
  id: string
  type: NotificationType
  read: boolean
  createdAt: Date
  actor: { username: string; name: string | null; avatar: string | null }
  photo: { id: string; thumbnailPath: string } | null
  commentId: string | null
  /** The start of the comment, for a comment notification. */
  excerpt: string | null
  /** How many more people did the same, folded into this row. */
  others: number
}

/** Where a page ends: the oldest notification it took. Pages after it are strictly older. */
export function encodeCursor(row: { createdAt: Date; id: string }): string {
  return `${row.createdAt.toISOString()}_${row.id}`
}

export function decodeCursor(value: string | null | undefined): { createdAt: Date; id: string } | null {
  if (!value) return null
  const at = value.indexOf('_')
  if (at < 0) return null
  const createdAt = new Date(value.slice(0, at))
  const id = value.slice(at + 1)
  if (Number.isNaN(createdAt.getTime()) || !id) return null
  return { createdAt, id }
}

/**
 * One page of someone's notifications, newest first, grouped.
 *
 * Likes on one photo fold into one row, and so do follows: "Ana and 4 others
 * liked your photo". Twelve likes on one frame used to be twelve rows, pushing
 * every comment out of the bell. Comments stay one each, since each carries its
 * own words. A row is unread if any part is.
 *
 * The page stops at the first notification it has no room for, and `next`
 * starts the following page there, so nothing is folded into a row on one page
 * and shown again on the next.
 */
export async function notificationPage(
  userId: string,
  hidden: string[],
  { before, groups: groupsShown }: { before?: { createdAt: Date; id: string } | null; groups: number }
): Promise<{ rows: NotificationRow[]; next: string | null }> {
  const notifications = await prisma.notification.findMany({
    where: {
      userId,
      ...(hidden.length > 0 ? { actorId: { notIn: hidden } } : {}),
      ...(before
        ? {
            OR: [
              { createdAt: { lt: before.createdAt } },
              { createdAt: before.createdAt, id: { lt: before.id } },
            ],
          }
        : {}),
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: ROWS_READ,
    include: { comment: { select: { content: true } } },
  })

  const actorIds = [...new Set(notifications.map(n => n.actorId))]
  const photoIds = [...new Set(notifications.filter(n => n.photoId).map(n => n.photoId!))]
  const [actors, photos] = await Promise.all([
    prisma.user.findMany({
      where: { id: { in: actorIds } },
      select: { id: true, username: true, name: true, avatar: true },
    }),
    prisma.photo.findMany({
      where: { id: { in: photoIds } },
      select: { id: true, thumbnailPath: true },
    }),
  ])
  const actorMap = new Map(actors.map(a => [a.id, a]))
  const photoMap = new Map(photos.map(p => [p.id, p]))

  const rows: NotificationRow[] = []
  const byKey = new Map<string, NotificationRow>()
  let next: string | null = null
  for (const [i, n] of notifications.entries()) {
    const actor = actorMap.get(n.actorId)
    // From an account that has since been deleted.
    if (!actor) continue
    const key = n.type === 'like' ? `like:${n.photoId}` : n.type === 'follow' ? 'follow' : `own:${n.id}`
    const group = byKey.get(key)
    if (group) {
      if (group.actor.username !== actor.username) group.others += 1
      if (!n.read) group.read = false
      continue
    }
    if (rows.length === groupsShown) {
      // The cursor is exclusive, so the next page starts after the last row
      // this one took and this row leads it.
      next = encodeCursor(notifications[i - 1])
      break
    }
    const row: NotificationRow = {
      id: n.id,
      type: n.type as NotificationRow['type'],
      read: n.read,
      createdAt: n.createdAt,
      actor: { username: actor.username, name: actor.name, avatar: actor.avatar },
      photo: n.photoId ? photoMap.get(n.photoId) ?? null : null,
      commentId: n.commentId,
      excerpt: n.comment ? n.comment.content.slice(0, 120) : null,
      others: 0,
    }
    byKey.set(key, row)
    rows.push(row)
  }
  // Every row read was used and there may be older ones.
  if (!next && notifications.length === ROWS_READ) next = encodeCursor(notifications[notifications.length - 1])

  return { rows, next }
}
