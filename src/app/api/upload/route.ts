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

  const formData = await req.formData()
  const files = formData.getAll('files') as File[]
  const caption = formData.get('caption') as string | null
  const cameraId = formData.get('cameraId') as string | null
  const filmStockId = formData.get('filmStockId') as string | null

  if (!files.length) {
    return NextResponse.json({ error: 'No files' }, { status: 400 })
  }

  const userId = (session.user as { id: string }).id
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
    const ext = file.name.split('.').pop() || 'jpg'
    const { originalPath, mediumPath, thumbnailPath, width, height } = await processImage(buffer, id, ext)

    const photo = await prisma.photo.create({
      data: {
        id,
        userId,
        originalPath,
        mediumPath,
        thumbnailPath,
        width,
        height,
        caption,
        cameraId: validCameraId,
        filmStockId: validFilmStockId
      }
    })
    photos.push(photo)
  }

  return NextResponse.json({ photos })
}
