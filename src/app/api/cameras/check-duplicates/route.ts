import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { findPotentialDuplicates } from '@/lib/duplicateDetection'
import { readJsonObject, invalidBody, asString } from '@/lib/requestBody'

export async function POST(req: NextRequest) {
  try {
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
          select: { photos: true }
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
