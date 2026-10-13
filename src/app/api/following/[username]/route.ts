import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { peoplePageArgs, peoplePageResponse } from '@/lib/peoplePage'
import { hiddenUserIds } from '@/lib/blocks'
import { bylineUserSelect } from '@/lib/publicUser'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ username: string }> }
) {
  const { username } = await params

  // Only user.id is used, to scope the query below.
  const user = await prisma.user.findUnique({
    where: { username },
    select: { id: true },
  })
  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  // The same rule the feeds apply. This route did not read the session at all,
  // so a blocked account was still named in the list, with a link to the
  // profile the block exists to keep out of the reader's way.
  const session = await getServerSession(authOptions)
  const viewerId = (session?.user as { id?: string } | undefined)?.id ?? null
  const hidden = await hiddenUserIds(viewerId)

  const following = await prisma.follow.findMany({
    where: {
      followerId: user.id,
      ...(hidden.length > 0 ? { followingId: { notIn: hidden } } : {}),
    },
    include: { following: { select: bylineUserSelect } },
    ...peoplePageArgs(req),
  })

  return peoplePageResponse(following, f => f.following)
}
