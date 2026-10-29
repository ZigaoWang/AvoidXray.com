import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { MAX_ALBUM_PHOTO_IDS } from '@/lib/albumPhotos'
import { invalidBody, readJsonObject } from '@/lib/requestBody'

/**
 * Puts an album's photos in the order given. Photos of the album not named
 * keep their order after them; ids that are not in the album are ignored.
 * The owner's own albums only.
 */
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  const userId = (session?.user as { id?: string } | undefined)?.id
  if (!userId) return NextResponse.json({ error: 'Sign in to do that' }, { status: 401 })
  const { id } = await params

  const album = await prisma.collection.findFirst({ where: { id, userId }, select: { id: true } })
  if (!album) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await readJsonObject(req)
  const raw = Array.isArray(body?.photoIds) ? body.photoIds : null
  if (!raw || raw.length > MAX_ALBUM_PHOTO_IDS || !raw.every(v => typeof v === 'string')) return invalidBody()

  const members = await prisma.collectionPhoto.findMany({
    where: { collectionId: id },
    select: { photoId: true },
    orderBy: [{ order: 'asc' }, { photoId: 'asc' }],
  })
  const inAlbum = new Set(members.map(m => m.photoId))
  const named = [...new Set(raw as string[])].filter(photoId => inAlbum.has(photoId))
  const rest = members.map(m => m.photoId).filter(photoId => !named.includes(photoId))
  await prisma.$transaction([...named, ...rest].map((photoId, order) =>
    prisma.collectionPhoto.update({ where: { collectionId_photoId: { collectionId: id, photoId } }, data: { order } })))
  return NextResponse.json({ ok: true })
}
