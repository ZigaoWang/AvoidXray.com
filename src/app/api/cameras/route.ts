import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'

export async function GET() {
  const cameras = await prisma.camera.findMany()

  // Only include imageUrl and description for approved images
  const sanitizedCameras = cameras.map(camera => ({
    ...camera,
    imageUrl: camera.imageStatus === 'approved' ? camera.imageUrl : null,
    description: camera.imageStatus === 'approved' ? camera.description : null,
    // Don't expose moderation fields to public
    imageStatus: undefined,
    imageUploadedBy: undefined,
    imageUploadedAt: undefined
  }))

  return NextResponse.json(sanitizedCameras)
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const contentType = req.headers.get('content-type') || ''
    let name: string
    let brand: string | undefined
    let hasImageData = false
    let imageFile: File | null = null
    let description: string | undefined
    let cameraType: string | undefined
    let format: string | undefined
    let year: number | undefined

    // Check if it's FormData (with image) or JSON (without image)
    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData()
      name = formData.get('name') as string
      brand = (formData.get('brand') as string) || undefined
      imageFile = formData.get('image') as File | null
      description = (formData.get('description') as string) || undefined
      cameraType = (formData.get('cameraType') as string) || undefined
      format = (formData.get('format') as string) || undefined
      const yearStr = formData.get('year') as string
      year = yearStr ? parseInt(yearStr, 10) : undefined
      hasImageData = !!imageFile
    } else {
      const body = await req.json()
      name = body.name
      brand = body.brand
      cameraType = body.cameraType
      format = body.format
      year = body.year ? parseInt(body.year, 10) : undefined
    }

    if (!name) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    }

    const userId = (session.user as { id: string }).id

    // Create camera with categorization fields
    const camera = await prisma.camera.create({
      data: {
        name,
        brand,
        userId,
        cameraType,
        format,
        year
      }
    })

    // If image data was provided, upload it
    if (hasImageData && imageFile) {
      const { uploadToOSS } = await import('@/lib/oss')
      const { processItemImage } = await import('@/lib/imageProcessing')

      // Process image with same pipeline as suggest edit
      const buffer = Buffer.from(await imageFile.arrayBuffer())
      const processedBuffer = await processItemImage(buffer)

      // Upload to OSS
      const key = `cameras/${camera.id}.webp`
      const imageUrl = await uploadToOSS(processedBuffer, key)

      // Update camera with approved image (no moderation for new items)
      await prisma.camera.update({
        where: { id: camera.id },
        data: {
          imageUrl,
          description,
          imageStatus: 'approved',
          imageUploadedBy: userId,
          imageUploadedAt: new Date()
        }
      })
    } else if (description) {
      // Save description even without image
      await prisma.camera.update({
        where: { id: camera.id },
        data: {
          description,
          imageStatus: 'approved'
        }
      })
    }

    return NextResponse.json(camera)
  } catch (error) {
    console.error('Create camera error:', error)
    return NextResponse.json(
      { error: 'Failed to create camera' },
      { status: 500 }
    )
  }
}
