import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { deleteFromOSS } from '@/lib/oss'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

function getOSSKey(url: string): string | null {
  const match = url.match(/aliyuncs\.com\/(.+)$/)
  return match ? match[1] : null
}

async function deletePhoto(photo: { id: string; originalPath: string; mediumPath: string; thumbnailPath: string }) {
  const keys = [photo.originalPath, photo.mediumPath, photo.thumbnailPath]
    .map(getOSSKey)
    .filter((k): k is string => k !== null)
  await Promise.all(keys.map(key => deleteFromOSS(key).catch(() => {})))
  await prisma.photo.delete({ where: { id: photo.id } })
}

// GET: Cron job to clean up old unpublished photos
// Requires CRON_SECRET in production
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  // In production, require CRON_SECRET
  if (process.env.NODE_ENV === 'production') {
    if (!cronSecret) {
      return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 })
    }
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  // Delete unpublished photos older than 1 hour
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000)

  const oldPhotos = await prisma.photo.findMany({
    where: { published: false, createdAt: { lt: oneHourAgo } }
  })

  let deleted = 0
  for (const photo of oldPhotos) {
    try {
      await deletePhoto(photo)
      deleted++
    } catch (e) {
      console.error(`Failed to delete photo ${photo.id}:`, e)
    }
  }

  return NextResponse.json({ success: true, deleted, checked: oldPhotos.length })
}

// POST: User-initiated cleanup for their own unpublished photos
// Called when user leaves upload page without publishing
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const userId = (session.user as { id: string }).id
  const { ids } = await req.json()

  if (!ids?.length) return NextResponse.json({ success: true, deleted: 0 })

  let deleted = 0
  for (const id of ids) {
    const photo = await prisma.photo.findUnique({ where: { id } })

    // Only allow deleting own unpublished photos
    if (!photo || photo.userId !== userId || photo.published) continue

    try {
      await deletePhoto(photo)
      deleted++
    } catch (e) {
      console.error(`Failed to delete photo ${id}:`, e)
    }
  }

  return NextResponse.json({ success: true, deleted })
}

// DELETE: Admin endpoint to force cleanup all unpublished photos
export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const user = await prisma.user.findUnique({
    where: { id: (session.user as { id: string }).id }
  })

  if (!user?.isAdmin) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  const unpublishedPhotos = await prisma.photo.findMany({
    where: { published: false }
  })

  let deleted = 0
  for (const photo of unpublishedPhotos) {
    try {
      await deletePhoto(photo)
      deleted++
    } catch (e) {
      console.error(`Failed to delete photo ${photo.id}:`, e)
    }
  }

  return NextResponse.json({ success: true, deleted })
}
