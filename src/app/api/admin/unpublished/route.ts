import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const userId = (session.user as { id: string }).id

  // Check if user is admin. Selected, not the whole row: this only needs one
  // boolean, and the row it was loading carries the password hash.
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { isAdmin: true },
  })
  if (!user?.isAdmin) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  // Get all unpublished photos
  const photos = await prisma.photo.findMany({
    where: { published: false },
    include: {
      user: {
        select: { username: true }
      }
    },
    orderBy: { createdAt: 'desc' }
  })

  return NextResponse.json(photos.map(p => ({
    id: p.id,
    thumbnailPath: p.thumbnailPath,
    caption: p.caption,
    cameraId: p.cameraId,
    filmStockId: p.filmStockId,
    createdAt: p.createdAt.toISOString(),
    user: { username: p.user.username }
  })))
}
