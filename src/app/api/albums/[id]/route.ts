import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'

// GET /api/albums/[id] - Get album details
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const album = await prisma.collection.findUnique({
    where: { id },
    include: {
      photos: {
        include: {
          photo: {
            include: {
              user: { select: { username: true, name: true, avatar: true } },
              filmStock: true,
              _count: { select: { likes: true } }
            }
          }
        },
        orderBy: { order: 'asc' }
      },
      user: { select: { username: true, name: true, avatar: true } },
      _count: { select: { photos: true } }
    }
  })

  if (!album) {
    return NextResponse.json({ error: 'Album not found' }, { status: 404 })
  }

  return NextResponse.json(album)
}

// PATCH /api/albums/[id] - Update album (name, description, add/remove photos)
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const userId = (session.user as { id: string }).id
  const body = await req.json()
  const { name, description, addPhotoIds, removePhotoIds } = body

  // Check ownership
  const album = await prisma.collection.findUnique({
    where: { id },
    select: { userId: true }
  })

  if (!album) {
    return NextResponse.json({ error: 'Album not found' }, { status: 404 })
  }

  if (album.userId !== userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Update album
  const updateData: any = {}

  if (name !== undefined) {
    updateData.name = name.trim()
  }

  if (description !== undefined) {
    updateData.description = description?.trim() || null
  }

  // Handle photo additions/removals
  if (addPhotoIds && addPhotoIds.length > 0) {
    // Get current max order
    const maxOrder = await prisma.collectionPhoto.findFirst({
      where: { collectionId: id },
      orderBy: { order: 'desc' },
      select: { order: true }
    })

    const startOrder = (maxOrder?.order ?? -1) + 1

    updateData.photos = {
      create: addPhotoIds.map((photoId: string, index: number) => ({
        photoId,
        order: startOrder + index
      }))
    }
  }

  if (removePhotoIds && removePhotoIds.length > 0) {
    if (!updateData.photos) updateData.photos = {}
    updateData.photos.deleteMany = {
      photoId: { in: removePhotoIds }
    }
  }

  const updatedAlbum = await prisma.collection.update({
    where: { id },
    data: updateData,
    include: {
      photos: {
        include: { photo: true },
        orderBy: { order: 'asc' }
      },
      _count: { select: { photos: true } }
    }
  })

  return NextResponse.json(updatedAlbum)
}

// DELETE /api/albums/[id] - Delete album
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const userId = (session.user as { id: string }).id

  // Check ownership
  const album = await prisma.collection.findUnique({
    where: { id },
    select: { userId: true }
  })

  if (!album) {
    return NextResponse.json({ error: 'Album not found' }, { status: 404 })
  }

  if (album.userId !== userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  await prisma.collection.delete({
    where: { id }
  })

  return NextResponse.json({ success: true })
}
