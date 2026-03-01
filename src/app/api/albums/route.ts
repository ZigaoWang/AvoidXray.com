import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'

// GET /api/albums - Get user's albums
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const userId = (session.user as { id: string }).id

  const albums = await prisma.collection.findMany({
    where: { userId },
    include: {
      photos: {
        include: { photo: true },
        orderBy: { order: 'asc' },
        take: 4
      },
      _count: { select: { photos: true } }
    },
    orderBy: { createdAt: 'desc' }
  })

  return NextResponse.json(albums)
}

// POST /api/albums - Create new album
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const userId = (session.user as { id: string }).id
  const body = await req.json()
  const { name, description, photoIds } = body
  const isPublic = body.public

  if (!name || name.trim() === '') {
    return NextResponse.json({ error: 'Album name is required' }, { status: 400 })
  }

  // Create album
  const album = await prisma.collection.create({
    data: {
      name: name.trim(),
      description: description?.trim() || null,
      public: isPublic || false,
      userId,
      photos: photoIds && photoIds.length > 0 ? {
        create: photoIds.map((photoId: string, index: number) => ({
          photoId,
          order: index
        }))
      } : undefined
    },
    include: {
      photos: {
        include: { photo: true },
        orderBy: { order: 'asc' }
      },
      _count: { select: { photos: true } }
    }
  })

  return NextResponse.json(album)
}
