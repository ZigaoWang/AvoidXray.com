import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'

// GET /api/photos/mine - Get current user's published photos
export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const userId = (session.user as { id: string }).id

  // `count` is cheap and answers "has this person published before", which is
  // what the upload page uses to decide whether to show the guidelines. Keying
  // it off real history rather than localStorage means a cleared browser does
  // not re-nag someone with 200 rolls behind them.
  const url = new URL(req.url)
  if (url.searchParams.get('countOnly') === '1') {
    const count = await prisma.photo.count({ where: { userId, published: true } })
    return NextResponse.json({ count })
  }

  const photos = await prisma.photo.findMany({
    where: {
      userId,
      published: true
    },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      thumbnailPath: true,
      caption: true
    }
  })

  return NextResponse.json(photos)
}
