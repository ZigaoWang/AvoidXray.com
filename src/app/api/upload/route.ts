import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { processImage } from '@/lib/image'
import { randomUUID } from 'crypto'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const currentUserId = (session.user as { id: string }).id

  const formData = await req.formData()
  const files = formData.getAll('files') as File[]
  const caption = formData.get('caption') as string | null
  const cameraId = formData.get('cameraId') as string | null
  const filmStockId = formData.get('filmStockId') as string | null
  const takenDateStr = formData.get('takenDate') as string | null
  const takenDate = takenDateStr ? new Date(takenDateStr + 'T00:00:00Z') : null
  const asUserId = formData.get('asUserId') as string | null

  if (!files.length) {
    return NextResponse.json({ error: 'No files' }, { status: 400 })
  }

  // Determine target user ID (admin can upload as another user)
  let targetUserId = currentUserId

  if (asUserId && asUserId !== currentUserId) {
    // Verify current user is admin
    const currentUser = await prisma.user.findUnique({ where: { id: currentUserId } })
    if (!currentUser?.isAdmin) {
      return NextResponse.json({ error: 'Only admins can upload as another user' }, { status: 403 })
    }

    // Verify target user exists
    const targetUser = await prisma.user.findUnique({ where: { id: asUserId } })
    if (!targetUser) {
      return NextResponse.json({ error: 'Target user not found' }, { status: 404 })
    }

    targetUserId = asUserId
  }

  const photos = []

  // Validate foreign keys exist
  let validCameraId = null
  let validFilmStockId = null

  if (cameraId && !cameraId.startsWith('new-')) {
    const camera = await prisma.camera.findUnique({ where: { id: cameraId } })
    if (camera) validCameraId = cameraId
  }

  if (filmStockId && !filmStockId.startsWith('new-')) {
    const film = await prisma.filmStock.findUnique({ where: { id: filmStockId } })
    if (film) validFilmStockId = filmStockId
  }

  for (const file of files) {
    const buffer = Buffer.from(await file.arrayBuffer())
    const id = randomUUID()
    const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg'
    const { originalPath, mediumPath, thumbnailPath, width, height, blurHash } = await processImage(buffer, id, ext)

    const photo = await prisma.photo.create({
      data: {
        id,
        userId: targetUserId,
        originalPath,
        mediumPath,
        thumbnailPath,
        blurHash,
        width,
        height,
        caption,
        cameraId: validCameraId,
        filmStockId: validFilmStockId,
        takenDate
      }
    })
    photos.push(photo)
  }

  return NextResponse.json({ photos })
}
