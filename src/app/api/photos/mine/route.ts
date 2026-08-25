import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'

// GET /api/photos/mine - Get current user's published photos
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const userId = (session.user as { id: string }).id

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
