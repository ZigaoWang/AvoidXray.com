import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { enforceLimit } from '@/lib/rateLimit'
import { LIMITS } from '@/lib/rateLimitPolicy'
import { isUniqueViolation } from '@/lib/prismaErrors'

/**
 * Blocks or unblocks another account, by username.
 *
 * Blocking also severs any follow in either direction. Leaving those in place
 * would keep the blocked account in your followers list and keep feeding your
 * posts into their following tab, which is not what anyone means by blocking.
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const blockerId = (session.user as { id: string }).id

  const limited = enforceLimit(
    'block', blockerId, LIMITS.reaction.perUser,
    'Too many changes at once. Please wait a moment.'
  )
  if (limited) return limited

  const { username } = await req.json().catch(() => ({}))
  if (typeof username !== 'string' || !username) {
    return NextResponse.json({ error: 'Missing username' }, { status: 400 })
  }

  const target = await prisma.user.findUnique({ where: { username }, select: { id: true } })
  if (!target) return NextResponse.json({ error: 'User not found' }, { status: 404 })
  if (target.id === blockerId) {
    return NextResponse.json({ error: 'You cannot block yourself' }, { status: 400 })
  }

  const existing = await prisma.block.findUnique({
    where: { blockerId_blockedId: { blockerId, blockedId: target.id } },
    select: { id: true },
  })

  if (existing) {
    await prisma.block.deleteMany({ where: { blockerId, blockedId: target.id } })
    return NextResponse.json({ blocked: false })
  }

  try {
    await prisma.block.create({ data: { blockerId, blockedId: target.id } })
  } catch (error) {
    // A concurrent request already created it; the caller's intent is met.
    if (!isUniqueViolation(error)) throw error
    return NextResponse.json({ blocked: true })
  }

  await prisma.follow.deleteMany({
    where: {
      OR: [
        { followerId: blockerId, followingId: target.id },
        { followerId: target.id, followingId: blockerId },
      ],
    },
  })

  return NextResponse.json({ blocked: true })
}
