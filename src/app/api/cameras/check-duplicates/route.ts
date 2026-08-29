import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { findPotentialDuplicates } from '@/lib/duplicateDetection'
import { PUBLIC_PHOTO } from '@/lib/photoVisibility'
import { enforceLimit } from '@/lib/rateLimit'
import { LIMITS } from '@/lib/rateLimitPolicy'
import { readJsonObject, invalidBody, asString } from '@/lib/requestBody'

export async function POST(req: NextRequest) {
  try {
    // Only reachable from the add-camera dialog, which requires an account.
    // It was open to anyone, and it scans the whole camera table per call.
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const userId = (session.user as { id: string }).id

    const limited = enforceLimit(
      'duplicateCheck', userId, LIMITS.duplicateCheck.perUser,
      'Too many checks in a short time. Please wait a moment.'
    )
    if (limited) return limited

    const body = await readJsonObject(req)
    if (!body) return invalidBody()
    const name = asString(body.name)?.trim()
    const brand = asString(body.brand)?.trim() || null
    if (!name) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    }

    // Get all cameras
    const cameras = await prisma.camera.findMany({
      select: {
        id: true,
        name: true,
        brand: true,
        imageUrl: true,
        imageStatus: true,
        _count: {
          // Scoped like every other photo count on the site.
          select: { photos: { where: PUBLIC_PHOTO } }
        }
      }
    })

    // Find potential duplicates
    const duplicates = findPotentialDuplicates(
      { name, brand },
      cameras,
      5,
      0.6 // Lower threshold to catch more potential matches
    )

    return NextResponse.json({
      hasPotentialDuplicates: duplicates.length > 0,
      suggestions: duplicates.map(d => ({
        id: d.id,
        name: d.name,
        brand: d.brand,
        imageUrl: d.imageStatus === 'approved' ? d.imageUrl : null,
        photoCount: d._count.photos,
        similarity: Math.round(d.similarity * 100)
      }))
    })
  } catch (error) {
    console.error('Check camera duplicates error:', error)
    return NextResponse.json(
      { error: 'Failed to check for duplicates' },
      { status: 500 }
    )
  }
}
