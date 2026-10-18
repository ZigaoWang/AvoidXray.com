import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { bylineUserSelect } from '@/lib/publicUser'
import { peoplePageArgs, peoplePageResponse } from '@/lib/peoplePage'
import { enforceLimit } from '@/lib/rateLimit'
import { LIMITS } from '@/lib/rateLimitPolicy'
import { isUniqueViolation } from '@/lib/prismaErrors'
import { lockAccountPair } from '@/lib/blocks'
import { readJsonObject, asString } from '@/lib/requestBody'

/**
 * The accounts the viewer has blocked, newest first, a page at a time.
 *
 * Unblocking used to need the blocked profile, which meant remembering who
 * you had blocked and finding them. Settings lists them from here.
 */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Sign in to do that' }, { status: 401 })
  const blockerId = (session.user as { id: string }).id

  const blocks = await prisma.block.findMany({
    include: { blocked: { select: bylineUserSelect } },
    ...peoplePageArgs(req, { blockerId }),
  })
  return peoplePageResponse(blocks, b => b.blocked, null)
}

/**
 * Blocks or unblocks another account, by username.
 *
 * Blocking also severs any follow in either direction. Leaving those in place
 * would keep the blocked account in your followers list and keep feeding your
 * posts into their following tab, which is not what anyone means by blocking.
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Sign in to do that' }, { status: 401 })
  const blockerId = (session.user as { id: string }).id

  const limited = enforceLimit(
    'block', blockerId, LIMITS.reaction.perUser,
    'Too many changes at once. Please wait a moment.'
  )
  if (limited) return limited

  // Destructured straight off the parsed body, a literal `null` body threw
  // here as a 500 instead of reaching the 400 that a bodyless request gets.
  const body = await readJsonObject(req)
  const username = asString(body?.username)
  if (!username) {
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

  // One transaction, under the lock /api/follow takes for the same pair, so a
  // follow cannot slip in between the block and the follows it severs.
  try {
    await prisma.$transaction(async tx => {
      await lockAccountPair(tx, blockerId, target.id)
      await tx.block.create({ data: { blockerId, blockedId: target.id } })
      await tx.follow.deleteMany({
        where: {
          OR: [
            { followerId: blockerId, followingId: target.id },
            { followerId: target.id, followingId: blockerId },
          ],
        },
      })
    })
  } catch (error) {
    // A concurrent request already created it, and severed the follows in the
    // same transaction; the caller's intent is met.
    if (!isUniqueViolation(error)) throw error
  }

  return NextResponse.json({ blocked: true })
}
