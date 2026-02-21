import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'

export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const userId = (session.user as { id: string }).id

    // Check if user is admin
    const user = await prisma.user.findUnique({
      where: { id: userId }
    })

    if (!user?.isAdmin) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    // Get pending moderation submissions
    const submissions = await prisma.moderationSubmission.findMany({
      where: { status: 'pending' },
      orderBy: { createdAt: 'desc' }
    })

    // Separate cameras and filmstocks
    const cameraSubmissions = submissions.filter(s => s.resourceType === 'camera')
    const filmStockSubmissions = submissions.filter(s => s.resourceType === 'filmstock')

    // Enrich camera submissions with resource and uploader data
    const camerasWithData = await Promise.all(
      cameraSubmissions.map(async (sub) => {
        const camera = await prisma.camera.findUnique({
          where: { id: sub.resourceId },
          select: { id: true, name: true, brand: true, userId: true }
        })

        const uploader = await prisma.user.findUnique({
          where: { id: sub.submittedBy },
          select: { id: true, username: true, name: true, avatar: true }
        })

        return {
          submissionId: sub.id,
          id: sub.resourceId,
          name: camera?.name || 'Unknown',
          brand: camera?.brand || null,
          // Show proposed image (what user wants to upload)
          imageUrl: sub.proposedImage,
          // Show proposed description
          description: (sub.proposedData as any)?.description || null,
          // Original data for comparison
          originalImage: sub.originalImage,
          originalData: sub.originalData,
          proposedData: sub.proposedData,
          imageUploadedAt: sub.createdAt.toISOString(),
          user: uploader || { id: sub.submittedBy, username: 'Unknown', name: null, avatar: null }
        }
      })
    )

    // Enrich filmstock submissions with resource and uploader data
    const filmStocksWithData = await Promise.all(
      filmStockSubmissions.map(async (sub) => {
        const filmStock = await prisma.filmStock.findUnique({
          where: { id: sub.resourceId },
          select: { id: true, name: true, brand: true, iso: true }
        })

        const uploader = await prisma.user.findUnique({
          where: { id: sub.submittedBy },
          select: { id: true, username: true, name: true, avatar: true }
        })

        return {
          submissionId: sub.id,
          id: sub.resourceId,
          name: filmStock?.name || 'Unknown',
          brand: filmStock?.brand || null,
          iso: filmStock?.iso || null,
          // Show proposed image (what user wants to upload)
          imageUrl: sub.proposedImage,
          // Show proposed description
          description: (sub.proposedData as any)?.description || null,
          // Original data for comparison
          originalImage: sub.originalImage,
          originalData: sub.originalData,
          proposedData: sub.proposedData,
          imageUploadedAt: sub.createdAt.toISOString(),
          uploader: uploader || { id: sub.submittedBy, username: 'Unknown', name: null, avatar: null }
        }
      })
    )

    return NextResponse.json({
      cameras: camerasWithData,
      filmStocks: filmStocksWithData,
      total: camerasWithData.length + filmStocksWithData.length
    })
  } catch (error) {
    console.error('Moderation list error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch pending items' },
      { status: 500 }
    )
  }
}
