import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { enforceLimit } from '@/lib/rateLimit'
import { LIMITS } from '@/lib/rateLimitPolicy'

/** The lengths ADMIN_RESOURCES already declares for these two columns. */
const ALBUM_NAME_MAX = 120
const ALBUM_DESCRIPTION_MAX = 2000
import { NOT_YOUR_PHOTOS, resolveOwnedPhotoIds } from '@/lib/albumPhotos'
import { readJsonObject, invalidBody } from '@/lib/requestBody'

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

  // Nothing throttled this, so one account could add rows carrying public text
  // for as long as it cared to, faster than anyone could clear them.
  const limited = enforceLimit(
    'album-write', userId, LIMITS.contentWrite.perUser,
    'You are creating albums very quickly. Please wait a moment.'
  )
  if (limited) return limited

  const body = await readJsonObject(req)
  if (!body) return invalidBody()
  const { name, description, photoIds } = body
  const isPublic = body.public

  if (typeof name !== 'string' || name.trim() === '') {
    return NextResponse.json({ error: 'Album name is required' }, { status: 400 })
  }

  // The cap the admin table already declares for this column. The endpoint
  // accepted a string of any length and rendered it on a public page.
  if (name.trim().length > ALBUM_NAME_MAX) {
    return NextResponse.json(
      { error: `Album name must be ${ALBUM_NAME_MAX} characters or fewer` },
      { status: 400 }
    )
  }
  if (typeof description === 'string' && description.length > ALBUM_DESCRIPTION_MAX) {
    return NextResponse.json(
      { error: `Description must be ${ALBUM_DESCRIPTION_MAX} characters or fewer` },
      { status: 400 }
    )
  }

  // An album collects its owner's own work. Without this an album could be
  // created around someone else's photos — and since a public album renders
  // what it holds, that put their private photos in front of strangers.
  const { ids: ownedPhotoIds, rejected } = await resolveOwnedPhotoIds(photoIds, userId)
  if (rejected > 0) {
    return NextResponse.json({ error: NOT_YOUR_PHOTOS }, { status: 403 })
  }

  // Create album
  const album = await prisma.collection.create({
    data: {
      name: name.trim(),
      description: typeof description === 'string' ? description.trim() || null : null,
      public: isPublic === true,
      userId,
      photos: ownedPhotoIds.length > 0 ? {
        create: ownedPhotoIds.map((photoId, index) => ({
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
