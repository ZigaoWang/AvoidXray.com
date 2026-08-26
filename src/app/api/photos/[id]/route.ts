import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { deleteFromOSS } from '@/lib/oss'
import { extractKeyFromUrl } from '@/lib/ossUtils'
import { canViewPhoto } from '@/lib/photoVisibility'
import { VALIDATION_LIMITS } from '@/lib/validation'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const photo = await prisma.photo.findUnique({
    where: { id },
    include: { camera: true, filmStock: true }
  })

  // /photos/[id] already gates on canViewPhoto; this route served the same
  // record — including originalPath — to anyone holding the id, which made a
  // private or half-uploaded photo retrievable by URL alone. A viewer who may
  // not see it gets the same 404 as one that does not exist, so the endpoint
  // cannot be used to test whether an id is real.
  const session = await getServerSession(authOptions)
  const viewerId = (session?.user as { id?: string } | undefined)?.id ?? null

  if (!photo || !canViewPhoto(photo, viewerId)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  return NextResponse.json(photo)
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const currentUserId = (session.user as { id: string }).id

  const photo = await prisma.photo.findUnique({ where: { id } })
  if (!photo) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // Check permission: must be photo owner OR admin
  if (photo.userId !== currentUserId) {
    const currentUser = await prisma.user.findUnique({ where: { id: currentUserId } })
    if (!currentUser?.isAdmin) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
    }
  }

  // Delete files from OSS
  const keys = [photo.originalPath, photo.mediumPath, photo.thumbnailPath]
    .map(extractKeyFromUrl)
    .filter((k): k is string => k !== null)
  await Promise.all(keys.map(key => deleteFromOSS(key).catch(() => {})))

  await prisma.photo.delete({ where: { id } })

  return NextResponse.json({ success: true })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params
    const currentUserId = (session.user as { id: string }).id
    const body = await req.json()
    const { caption, cameraId, filmStockId, takenDate, visibility } = body

    const photo = await prisma.photo.findUnique({ where: { id } })
    if (!photo) {
      return NextResponse.json({ error: 'Photo not found' }, { status: 404 })
    }

    // Check permission: must be photo owner OR admin
    let isAdmin = false
    if (photo.userId !== currentUserId) {
      const currentUser = await prisma.user.findUnique({ where: { id: currentUserId } })
      if (!currentUser?.isAdmin) {
        return NextResponse.json({ error: 'Not authorized to edit this photo' }, { status: 403 })
      }
      isAdmin = true
    }

    // Validate camera exists if provided
    if (cameraId) {
      const camera = await prisma.camera.findUnique({ where: { id: cameraId } })
      if (!camera) {
        console.error(`[Photo PATCH] Camera not found: ${cameraId}`)
        return NextResponse.json({ error: 'Camera not found' }, { status: 400 })
      }
    }

    // Validate film stock exists if provided
    if (filmStockId) {
      const filmStock = await prisma.filmStock.findUnique({ where: { id: filmStockId } })
      if (!filmStock) {
        console.error(`[Photo PATCH] Film stock not found: ${filmStockId}`)
        return NextResponse.json({ error: 'Film stock not found' }, { status: 400 })
      }
    }

    if (caption !== undefined && caption !== null) {
      if (typeof caption !== 'string') {
        return NextResponse.json({ error: 'Caption must be text' }, { status: 400 })
      }
      if (caption.length > VALIDATION_LIMITS.MAX_CAPTION_LENGTH) {
        return NextResponse.json(
          { error: `Caption must be ${VALIDATION_LIMITS.MAX_CAPTION_LENGTH} characters or fewer` },
          { status: 400 }
        )
      }
    }

    // Only the owner decides who can see their photo. An admin can fix a
    // photo's metadata, but flipping someone else's photo public is not
    // moderation, so it is refused rather than silently ignored.
    if (visibility !== undefined) {
      if (visibility !== 'PUBLIC' && visibility !== 'PRIVATE') {
        return NextResponse.json({ error: 'visibility must be PUBLIC or PRIVATE' }, { status: 400 })
      }
      if (isAdmin) {
        return NextResponse.json(
          { error: 'Only the owner can change a photo\'s visibility' },
          { status: 403 }
        )
      }
    }

    const updated = await prisma.photo.update({
      where: { id },
      data: {
        caption: caption !== undefined ? caption : photo.caption,
        cameraId: cameraId !== undefined ? (cameraId || null) : photo.cameraId,
        filmStockId: filmStockId !== undefined ? (filmStockId || null) : photo.filmStockId,
        published: true,
        visibility: visibility ?? photo.visibility,
        takenDate: takenDate ? new Date(takenDate + 'T00:00:00Z') : photo.takenDate
      }
    })

    console.log(`[Photo PATCH] Updated photo ${id}: cameraId=${updated.cameraId}, filmStockId=${updated.filmStockId}, published=${updated.published}${isAdmin ? ' (by admin)' : ''}`)

    return NextResponse.json(updated)
  } catch (error) {
    console.error('[Photo PATCH] Error:', error)
    return NextResponse.json({ error: 'Failed to update photo' }, { status: 500 })
  }
}
