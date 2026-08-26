import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { Prisma } from '@prisma/client'
import { visibleToViewer } from '@/lib/photoVisibility'
import { bylineUserSelect } from '@/lib/publicUser'
import { NOT_YOUR_PHOTOS, resolveOwnedPhotoIds } from '@/lib/albumPhotos'
import { readJsonObject, invalidBody } from '@/lib/requestBody'

// GET /api/albums/[id] - Get album details
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  const userId = (session?.user as { id?: string } | undefined)?.id ?? null

  const album = await prisma.collection.findUnique({
    where: { id },
    include: {
      photos: {
        // A public album can still hold a private photo. The owner sees their
        // own here — the edit page is built on this response — and nobody else
        // does. /albums/[id] applies the same filter; this route served the
        // unfiltered set, so a private photo leaked to anyone who asked for it
        // over the API rather than through the page.
        where: { photo: visibleToViewer(userId) },
        include: {
          photo: {
            include: {
              user: { select: bylineUserSelect },
              filmStock: true,
              _count: { select: { likes: true } }
            }
          }
        },
        orderBy: { order: 'asc' }
      },
      user: { select: bylineUserSelect },
      // Counts what the caller can actually see, so the number matches the list.
      _count: { select: { photos: { where: { photo: visibleToViewer(userId) } } } }
    }
  })

  if (!album) {
    return NextResponse.json({ error: 'Album not found' }, { status: 404 })
  }

  // A private album belongs to its owner alone. Answering 404 rather than 403
  // keeps the album's existence private too.
  if (!album.public && album.userId !== userId) {
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
  const body = await readJsonObject(req)
  if (!body) return invalidBody()
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

  // Each field is checked for its own type before being written. Previously a
  // non-string name threw on .trim() as a 500, a non-boolean `public` reached
  // Prisma and failed there, and an empty name was accepted here even though
  // creating an album rejects one.
  if (name !== undefined) {
    if (typeof name !== 'string' || name.trim() === '') {
      return NextResponse.json({ error: 'Album name is required' }, { status: 400 })
    }
    updateData.name = name.trim()
  }

  if (description !== undefined) {
    updateData.description = typeof description === 'string' ? description.trim() || null : null
  }

  if (isPublic !== undefined) {
    if (typeof isPublic !== 'boolean') {
      return NextResponse.json({ error: 'public must be true or false' }, { status: 400 })
    }
    updateData.public = isPublic
  }

  // Photo additions and removals go into a single nested write, built up here
  // so both can be applied in one update rather than clobbering each other.
  const photoOps: Prisma.CollectionPhotoUpdateManyWithoutCollectionNestedInput = {}

  if (Array.isArray(addPhotoIds) && addPhotoIds.length > 0) {
    // Only the caller's own photos. Refused rather than silently filtered, so a
    // client that sends the wrong thing is told, instead of quietly saving an
    // album that is missing photos the person thought they had added.
    const { ids, rejected } = await resolveOwnedPhotoIds(addPhotoIds, userId)
    if (rejected > 0) {
      return NextResponse.json({ error: NOT_YOUR_PHOTOS }, { status: 403 })
    }

    // Append after whatever is already in the album.
    const maxOrder = await prisma.collectionPhoto.findFirst({
      where: { collectionId: id },
      orderBy: { order: 'desc' },
      select: { order: true }
    })

    const startOrder = (maxOrder?.order ?? -1) + 1

    photoOps.create = ids.map((photoId, index) => ({
      photoId,
      order: startOrder + index
    }))
  }

  // Scoped to this album's rows by the nested write, and the album's ownership
  // is checked above, so removal needs no further permission check — only that
  // the ids are actually a list of ids.
  if (Array.isArray(removePhotoIds)) {
    const ids = removePhotoIds.filter((photoId): photoId is string => typeof photoId === 'string')
    if (ids.length > 0) photoOps.deleteMany = { photoId: { in: ids } }
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
