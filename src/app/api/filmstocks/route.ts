import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { allocateSlug } from '@/lib/seo/ensureSlug'
import { COLOR_BALANCES, FILM_PROCESSES, inferManufacturer, inferProcessFields, normalizeAliases, normalizeManufacturer, toColorBalance, toFilmProcess } from '@/lib/filmFields'

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

  const contentLength = req.headers.get('content-length')
  if (contentLength && parseInt(contentLength) > 10 * 1024 * 1024) {
    return NextResponse.json({ error: 'File too large. Maximum size is 10MB.' }, { status: 413 })
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
    // Single value from the form, stored as an array. The field is multi-valued
    // in the schema; the form stays single-select for now.
    let format: string | undefined
    let manufacturer: string | undefined
    let processValue: string | undefined
    let colorBalanceValue: string | undefined
    let aliasesInput: string | undefined
    let exposures: string | undefined

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
      manufacturer = (formData.get('manufacturer') as string) || undefined
      processValue = (formData.get('process') as string) || undefined
      colorBalanceValue = (formData.get('colorBalance') as string) || undefined
      aliasesInput = (formData.get('aliases') as string) || undefined
      exposures = (formData.get('exposures') as string) || undefined
      hasImageData = !!imageFile
    } else {
      const body = await req.json()
      name = body.name
      brand = body.brand
      iso = body.iso ? parseInt(body.iso, 10) : undefined
      filmType = body.filmType
      format = body.format
      manufacturer = body.manufacturer
      processValue = body.process
      colorBalanceValue = body.colorBalance
      aliasesInput = Array.isArray(body.aliases) ? body.aliases.join(',') : body.aliases
      exposures = body.exposures
    }

    if (!name) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    }

    // manufacturer is required; fall back to reading it off the name so an
    // older client that does not send it still produces a complete row.
    const resolvedManufacturer = manufacturer?.trim()
      ? normalizeManufacturer(manufacturer)
      : inferManufacturer(name)
    if (!resolvedManufacturer) {
      return NextResponse.json(
        { error: 'Manufacturer is required and could not be read from the name' },
        { status: 400 }
      )
    }

    const process = toFilmProcess(processValue)
    if (processValue && !process) {
      return NextResponse.json(
        { error: `Process must be one of ${FILM_PROCESSES.join(', ')}` },
        { status: 400 }
      )
    }

    // The column is NOT NULL, and the form marks this field required — but the
    // form is the only thing that was enforcing it, so a request without one
    // reached Prisma and failed on the constraint. Falls back to reading the
    // film type the same way the backfill did, so an older client that does
    // not send the field still produces a valid row.
    const resolvedProcess =
      process ??
      toFilmProcess(
        inferProcessFields({ name, filmType: filmType ?? null, description: null }).process
      )
    if (!resolvedProcess) {
      return NextResponse.json(
        { error: `Process is required and must be one of ${FILM_PROCESSES.join(', ')}` },
        { status: 400 }
      )
    }

    const colorBalance = toColorBalance(colorBalanceValue)
    if (colorBalanceValue && !colorBalance) {
      return NextResponse.json(
        { error: `Color balance must be one of ${COLOR_BALANCES.join(', ')}` },
        { status: 400 }
      )
    }

    const userId = (session.user as { id: string }).id

    // Create film stock with categorization fields
    const filmStock = await prisma.filmStock.create({
      data: {
        name,
        brand,
        manufacturer: resolvedManufacturer,
        slug: await allocateSlug('filmstock', name, brand),
        iso,
        filmType,
        exposures,
        format: format ? [format] : [],
        process: resolvedProcess,
        colorBalance,
        aliases: normalizeAliases(aliasesInput ? aliasesInput.split(',') : []),
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
