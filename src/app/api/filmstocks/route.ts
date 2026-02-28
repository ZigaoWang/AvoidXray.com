import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'

export async function GET() {
  const filmStocks = await prisma.filmStock.findMany()

  // Only include imageUrl and description for approved images
  const sanitizedFilmStocks = filmStocks.map(filmStock => ({
    ...filmStock,
    imageUrl: filmStock.imageStatus === 'approved' ? filmStock.imageUrl : null,
    description: filmStock.imageStatus === 'approved' ? filmStock.description : null,
    // Don't expose moderation fields to public
    imageStatus: undefined,
    imageUploadedBy: undefined,
    imageUploadedAt: undefined
  }))

  return NextResponse.json(sanitizedFilmStocks)
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
    let iso: number | undefined
    let hasImageData = false
    let imageFile: File | null = null
    let description: string | undefined
    let filmType: string | undefined
    let format: string | undefined

    // Check if it's FormData (with image) or JSON (without image)
    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData()
      name = formData.get('name') as string
      brand = (formData.get('brand') as string) || undefined
      const isoStr = formData.get('iso') as string
      iso = isoStr ? parseInt(isoStr, 10) : undefined
      imageFile = formData.get('image') as File | null
      description = (formData.get('description') as string) || undefined
      filmType = (formData.get('filmType') as string) || undefined
      format = (formData.get('format') as string) || undefined
      hasImageData = !!imageFile
    } else {
      const body = await req.json()
      name = body.name
      brand = body.brand
      iso = body.iso ? parseInt(body.iso, 10) : undefined
      filmType = body.filmType
      format = body.format
    }

    if (!name) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    }

    const userId = (session.user as { id: string }).id

    // Create film stock with categorization fields
    const filmStock = await prisma.filmStock.create({
      data: {
        name,
        brand,
        iso,
        filmType,
        format
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
      const key = `filmstocks/${filmStock.id}.webp`
      const imageUrl = await uploadToOSS(processedBuffer, key)

      // Update film stock with approved image (no moderation for new items)
      await prisma.filmStock.update({
        where: { id: filmStock.id },
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
      await prisma.filmStock.update({
        where: { id: filmStock.id },
        data: {
          description,
          imageStatus: 'approved'
        }
      })
    }

    return NextResponse.json(filmStock)
  } catch (error) {
    console.error('Create film stock error:', error)
    return NextResponse.json(
      { error: 'Failed to create film stock' },
      { status: 500 }
    )
  }
}
