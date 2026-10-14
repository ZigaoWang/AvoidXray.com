import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { hiddenUserIds } from '@/lib/blocks'
import { notificationPage } from '@/lib/notifications'

/** Rows the bell shows, after grouping. The rest are on /notifications. */
const ROWS_SHOWN = 20

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'Sign in to do that' }, { status: 401 })
  }

  const userId = (session.user as { id: string }).id

  // Blocking filters the feeds and the like list but never deleted the rows
  // already in the bell, so a blocked account kept turning up here.
  const hidden = await hiddenUserIds(userId)

  // Counted across every notification, not just the page below. Deriving it
  // from the fetched twenty capped the badge at 20 no matter how many were
  // actually unread, so the number stopped moving as it mattered most. Same
  // block filter as the list, or the badge would count notices the list
  // refuses to show and never come back down to zero.
  const [page, unreadCount] = await Promise.all([
    notificationPage(userId, hidden, { groups: ROWS_SHOWN }),
    prisma.notification.count({
      where: { userId, read: false, ...(hidden.length > 0 ? { actorId: { notIn: hidden } } : {}) },
    }),
  ])

  return NextResponse.json({ notifications: page.rows, unreadCount, more: page.next !== null })
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
