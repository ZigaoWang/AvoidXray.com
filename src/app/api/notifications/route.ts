import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { hiddenUserIds } from '@/lib/blocks'

/** Rows the bell shows, after grouping. */
const ROWS_SHOWN = 20
/** Rows read to fill them. */
const ROWS_READ = 100

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'Sign in to do that' }, { status: 401 })
  }

  const userId = (session.user as { id: string }).id

  // Blocking filters the feeds and the like list but never deleted the rows
  // already in the bell, so a blocked account kept turning up here.
  const hidden = await hiddenUserIds(userId)
  const notFromHidden = hidden.length > 0 ? { actorId: { notIn: hidden } } : {}

  // Counted across every notification, not just the page below. Deriving it
  // from the fetched twenty capped the badge at 20 no matter how many were
  // actually unread, so the number stopped moving as it mattered most. Same
  // block filter as the list, or the badge would count notices the list
  // refuses to show and never come back down to zero.
  const [notifications, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where: { userId, ...notFromHidden },
      orderBy: { createdAt: 'desc' },
      // More rows than the bell shows, since likes and follows fold together
      // below and twenty rows could be one busy photo.
      take: ROWS_READ,
      // The start of a comment, so the bell can say what was said.
      include: { comment: { select: { content: true } } },
    }),
    prisma.notification.count({ where: { userId, read: false, ...notFromHidden } }),
  ])

  // The actors and photos named in the page, read together.
  const actorIds = [...new Set(notifications.map(n => n.actorId))]
  const photoIds = notifications.filter(n => n.photoId).map(n => n.photoId!)
  const [actors, photos] = await Promise.all([
    prisma.user.findMany({
      where: { id: { in: actorIds } },
      select: { id: true, username: true, name: true, avatar: true }
    }),
    prisma.photo.findMany({
      where: { id: { in: photoIds } },
      select: { id: true, thumbnailPath: true }
    }),
  ])
  const actorMap = Object.fromEntries(actors.map(a => [a.id, a]))
  const photoMap = Object.fromEntries(photos.map(p => [p.id, p]))

  const enriched = notifications
    .map(({ comment, ...n }) => ({
      ...n,
      actor: actorMap[n.actorId],
      photo: n.photoId ? photoMap[n.photoId] : null,
      excerpt: comment ? comment.content.slice(0, 120) : null,
    }))
    .filter(n => n.actor) // Filter out notifications from deleted users

  /**
   * Likes on one photo fold into one row, and so do follows: "Ana and 4
   * others liked your photo". Twelve likes on one frame used to be twelve
   * rows, pushing every comment out of the bell. Comments stay one each,
   * since each carries its own words. A row is unread if any part is.
   */
  const groups: (typeof enriched[number] & { others: number })[] = []
  const byKey = new Map<string, (typeof groups)[number]>()
  for (const n of enriched) {
    const key = n.type === 'like' ? `like:${n.photoId}` : n.type === 'follow' ? 'follow' : `own:${n.id}`
    const group = byKey.get(key)
    if (group) {
      if (group.actor!.username !== n.actor!.username) group.others += 1
      if (!n.read) group.read = false
      continue
    }
    if (groups.length === ROWS_SHOWN) continue
    const created = { ...n, others: 0 }
    byKey.set(key, created)
    groups.push(created)
  }

  return NextResponse.json({ notifications: groups, unreadCount })
}

export async function PATCH() {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'Sign in to do that' }, { status: 401 })
  }

  const userId = (session.user as { id: string }).id

  await prisma.notification.updateMany({
    where: { userId, read: false },
    data: { read: true }
  })

  return NextResponse.json({ success: true })
}
