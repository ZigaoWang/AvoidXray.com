import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const userId = (session.user as { id: string }).id

  const notifications = await prisma.notification.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: 20
  })

  // Get actor info for each notification
  const actorIds = [...new Set(notifications.map(n => n.actorId))]
  const actors = await prisma.user.findMany({
    where: { id: { in: actorIds } },
    select: { id: true, username: true, name: true, avatar: true }
  })
  const actorMap = Object.fromEntries(actors.map(a => [a.id, a]))

  // Get photo info for notifications with photoId
  const photoIds = notifications.filter(n => n.photoId).map(n => n.photoId!)
  const photos = await prisma.photo.findMany({
    where: { id: { in: photoIds } },
    select: { id: true, thumbnailPath: true }
  })
  const photoMap = Object.fromEntries(photos.map(p => [p.id, p]))

  const enriched = notifications
    .map(n => ({
      ...n,
      actor: actorMap[n.actorId],
      photo: n.photoId ? photoMap[n.photoId] : null
    }))
    .filter(n => n.actor) // Filter out notifications from deleted users

  // Counted across every notification, not just the page above. Deriving it
  // from the fetched twenty capped the badge at 20 no matter how many were
  // actually unread, so the number stopped moving as it mattered most.
  const unreadCount = await prisma.notification.count({
    where: { userId, read: false }
  })

  return NextResponse.json({ notifications: enriched, unreadCount })
}

export async function PATCH() {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const userId = (session.user as { id: string }).id

  await prisma.notification.updateMany({
    where: { userId, read: false },
    data: { read: true }
  })

  return NextResponse.json({ success: true })
}
