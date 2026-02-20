import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { deleteFromOSS } from '@/lib/oss'

function getOSSKey(url: string): string | null {
  const match = url.match(/aliyuncs\.com\/(.+)$/)
  return match ? match[1] : null
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const photo = await prisma.photo.findUnique({
    where: { id },
    include: { camera: true, filmStock: true }
  })
  if (!photo) {
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
  const userId = (session.user as { id: string }).id

  const photo = await prisma.photo.findUnique({ where: { id } })
  if (!photo || photo.userId !== userId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // Delete files from OSS
  const keys = [photo.originalPath, photo.mediumPath, photo.thumbnailPath]
    .map(getOSSKey)
    .filter((k): k is string => k !== null)
  await Promise.all(keys.map(key => deleteFromOSS(key).catch(() => {})))

  await prisma.photo.delete({ where: { id } })

  // Clean up orphaned cameras and film stocks
  await Promise.all([
    prisma.camera.deleteMany({ where: { photos: { none: {} } } }),
    prisma.filmStock.deleteMany({ where: { photos: { none: {} } } })
  ])

  return NextResponse.json({ success: true })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const userId = (session.user as { id: string }).id
  const { caption, cameraId, filmStockId, takenDate } = await req.json()

  const photo = await prisma.photo.findUnique({ where: { id } })
  if (!photo || photo.userId !== userId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const updated = await prisma.photo.update({
    where: { id },
    data: {
      caption,
      cameraId: cameraId || null,
      filmStockId: filmStockId || null,
      published: true,
      takenDate: takenDate ? new Date(takenDate + 'T00:00:00Z') : null
    }
  })

  return NextResponse.json(updated)
}
