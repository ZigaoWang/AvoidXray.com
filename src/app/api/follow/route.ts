import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { isUniqueViolation } from '@/lib/prismaErrors'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { username } = await req.json()
  // Type-checked, not just truthy: a non-string reached findUnique and threw,
  // so a malformed body answered 500 where it should answer 400.
  if (typeof username !== 'string' || !username) {
    return NextResponse.json({ error: 'Missing username' }, { status: 400 })
  }

  const followerId = (session.user as { id: string }).id
  const targetUser = await prisma.user.findUnique({ where: { username } })

  if (!targetUser) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  if (targetUser.id === followerId) {
    return NextResponse.json({ error: 'Cannot follow yourself' }, { status: 400 })
  }

  const existing = await prisma.follow.findUnique({
    where: { followerId_followingId: { followerId, followingId: targetUser.id } }
  })

  if (existing) {
    // deleteMany tolerates the row already having been removed by a concurrent
    // unfollow; delete throws in that case.
    await prisma.follow.deleteMany({ where: { followerId, followingId: targetUser.id } })
    return NextResponse.json({ following: false })
  }

  try {
    await prisma.follow.create({
      data: { followerId, followingId: targetUser.id }
    })
  } catch (error) {
    // A concurrent request already created it — the caller's intent is satisfied,
    // and the notification it sent should not be duplicated.
    if (!isUniqueViolation(error)) throw error
    return NextResponse.json({ following: true })
  }

  await prisma.notification.create({
    data: { type: 'follow', userId: targetUser.id, actorId: followerId }
  })

  return NextResponse.json({ following: true })
}
