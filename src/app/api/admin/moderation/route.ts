import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { Prisma } from '@prisma/client'

/**
 * proposedData is a free-form JSON column, so nothing guarantees it is an
 * object or that it carries a string description. Reads the one field the
 * moderation UI needs and returns null for every other shape.
 */
function proposedDescription(data: Prisma.JsonValue | null): string | null {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null
  const description = (data as Prisma.JsonObject).description
  return typeof description === 'string' && description.trim() ? description : null
}

/** Submissions returned at once. */
const QUEUE_LIMIT = 100

export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: 'Sign in to do that' }, { status: 401 })
    }

    const userId = (session.user as { id: string }).id

    // Check if user is admin
    const user = await prisma.user.findUnique({
      where: { id: userId }
    })

    if (!user?.isAdmin) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    // Newest first, and bounded. Each submission used to cost two more
    // queries (its resource and its uploader) issued one per row, so the page
    // got slower with every item left waiting; now it is four reads however
    // long the queue. An admin works from the top, and anything past the cap
    // appears as the ones above it are decided.
    const submissions = await prisma.moderationSubmission.findMany({
      where: { status: 'pending' },
      orderBy: { createdAt: 'desc' },
      take: QUEUE_LIMIT,
    })

    // Separate cameras and filmstocks
    const cameraSubmissions = submissions.filter(s => s.resourceType === 'camera')
    const filmStockSubmissions = submissions.filter(s => s.resourceType === 'filmstock')

    const [cameras, filmStocks, uploaders] = await Promise.all([
      cameraSubmissions.length
        ? prisma.camera.findMany({
            where: { id: { in: [...new Set(cameraSubmissions.map(s => s.resourceId))] } },
            select: { id: true, name: true, brand: true },
          })
        : [],
      filmStockSubmissions.length
        ? prisma.filmStock.findMany({
            where: { id: { in: [...new Set(filmStockSubmissions.map(s => s.resourceId))] } },
            select: { id: true, name: true, brand: true, iso: true },
          })
        : [],
      submissions.length
        ? prisma.user.findMany({
            where: { id: { in: [...new Set(submissions.map(s => s.submittedBy))] } },
            select: { id: true, username: true, name: true, avatar: true },
          })
        : [],
    ])
    const cameraById = new Map(cameras.map(c => [c.id, c]))
    const filmStockById = new Map(filmStocks.map(f => [f.id, f]))
    const uploaderById = new Map(uploaders.map(u => [u.id, u]))
    const uploaderOf = (submittedBy: string) =>
      uploaderById.get(submittedBy) ?? { id: submittedBy, username: 'Unknown', name: null, avatar: null }

    const camerasWithData = cameraSubmissions.map(sub => {
      const camera = cameraById.get(sub.resourceId)
      return {
        submissionId: sub.id,
        id: sub.resourceId,
        name: camera?.name || 'Unknown',
        brand: camera?.brand || null,
        // Show proposed image (what user wants to upload)
        imageUrl: sub.proposedImage,
        // Show proposed description
        description: proposedDescription(sub.proposedData),
        // Original data for comparison
        originalImage: sub.originalImage,
        originalData: sub.originalData,
        proposedData: sub.proposedData,
        imageUploadedAt: sub.createdAt.toISOString(),
        user: uploaderOf(sub.submittedBy),
      }
    })

    const filmStocksWithData = filmStockSubmissions.map(sub => {
      const filmStock = filmStockById.get(sub.resourceId)
      return {
        submissionId: sub.id,
        id: sub.resourceId,
        name: filmStock?.name || 'Unknown',
        brand: filmStock?.brand || null,
        iso: filmStock?.iso || null,
        // Show proposed image (what user wants to upload)
        imageUrl: sub.proposedImage,
        // Show proposed description
        description: proposedDescription(sub.proposedData),
        // Original data for comparison
        originalImage: sub.originalImage,
        originalData: sub.originalData,
        proposedData: sub.proposedData,
        imageUploadedAt: sub.createdAt.toISOString(),
        uploader: uploaderOf(sub.submittedBy),
      }
    })

    return NextResponse.json({
      cameras: camerasWithData,
      filmStocks: filmStocksWithData,
      total: camerasWithData.length + filmStocksWithData.length
    })
  } catch (error) {
    console.error('Moderation list error:', error)
    return NextResponse.json(
      { error: 'Could not load the queue' },
      { status: 500 }
    )
  }
}
