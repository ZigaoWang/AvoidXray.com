import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { hiddenUserIds } from '@/lib/blocks'

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
      take: 20
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
    .map(n => ({
      ...n,
      actor: actorMap[n.actorId],
      photo: n.photoId ? photoMap[n.photoId] : null
    }))
    .filter(n => n.actor) // Filter out notifications from deleted users

  return NextResponse.json({ notifications: enriched, unreadCount })
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
