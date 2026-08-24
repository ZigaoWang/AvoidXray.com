import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { Prisma } from '@prisma/client'

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

// PATCH /api/albums/[id] - Update album (name, description, public, add/remove photos)
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
  const isPublic = body.public

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

  const updateData: Prisma.CollectionUpdateInput = {}

  if (name !== undefined) {
    updateData.name = name.trim()
  }

  if (description !== undefined) {
    updateData.description = description?.trim() || null
  }

  if (isPublic !== undefined) {
    updateData.public = isPublic
  }

  // Photo additions and removals go into a single nested write, built up here
  // so both can be applied in one update rather than clobbering each other.
  const photoOps: Prisma.CollectionPhotoUpdateManyWithoutCollectionNestedInput = {}

  if (addPhotoIds && addPhotoIds.length > 0) {
    // Append after whatever is already in the album.
    const maxOrder = await prisma.collectionPhoto.findFirst({
      where: { collectionId: id },
      orderBy: { order: 'desc' },
      select: { order: true }
    })

    const startOrder = (maxOrder?.order ?? -1) + 1

    photoOps.create = addPhotoIds.map((photoId: string, index: number) => ({
      photoId,
      order: startOrder + index
    }))
  }

  if (removePhotoIds && removePhotoIds.length > 0) {
    photoOps.deleteMany = { photoId: { in: removePhotoIds } }
  }

  if (photoOps.create || photoOps.deleteMany) {
    updateData.photos = photoOps
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
