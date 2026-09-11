import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { allocateSlug } from '@/lib/seo/ensureSlug'
import {
  COLOR_BALANCES,
  FILM_PROCESSES,
  defaultFilmAxes,
  inferManufacturer,
  inferProcessFields,
  normalizeAliases,
  normalizeManufacturer,
  toColorBalance,
  toFilmProcess,
} from '@/lib/filmFields'
import { readJsonObject, invalidBody, asString, asInt } from '@/lib/requestBody'
import { resolveBrand } from '@/lib/brands'
import { enforceLimit } from '@/lib/rateLimit'
import { LIMITS } from '@/lib/rateLimitPolicy'
import { randomUUID } from 'crypto'
import { extractKeyFromUrl, generateImageKey } from '@/lib/ossUtils'
import { ADMIN_RESOURCES } from '@/lib/admin/resources'

export async function GET() {
  // The columns the callers actually read. See the camera route for why.
  const filmStocks = await prisma.filmStock.findMany({
    select: {
      id: true,
      slug: true,
      name: true,
      brand: true,
      manufacturer: true,
      aliases: true,
      imageUrl: true,
      imageStatus: true,
      iso: true,
      process: true,
      colorBalance: true,
      format: true,
    },
    orderBy: { name: 'asc' },
  })

  // An image still under review is nobody's business but the moderators'.
  const sanitized = filmStocks.map(({ imageStatus, ...film }) => ({
    ...film,
    imageUrl: imageStatus === 'approved' ? film.imageUrl : null,
  }))

  return NextResponse.json(sanitized)
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const limited = enforceLimit(
    'catalogCreate', (session.user as { id: string }).id, LIMITS.catalogCreate.perUser,
    'Too many new catalog entries in a short time. Please wait a moment.'
  )
  if (limited) return limited

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
      iso = asInt(formData.get('iso'))
      imageFile = formData.get('image') as File | null
      description = (formData.get('description') as string) || undefined
      format = (formData.get('format') as string) || undefined
      manufacturer = (formData.get('manufacturer') as string) || undefined
      processValue = (formData.get('process') as string) || undefined
      colorBalanceValue = (formData.get('colorBalance') as string) || undefined
      aliasesInput = (formData.get('aliases') as string) || undefined
      exposures = (formData.get('exposures') as string) || undefined
      hasImageData = !!imageFile
    } else {
      const body = await readJsonObject(req)
      if (!body) return invalidBody()
      name = asString(body.name) ?? ''
      brand = asString(body.brand)
      iso = asInt(body.iso)
      format = asString(body.format)
      manufacturer = asString(body.manufacturer)
      processValue = asString(body.process)
      colorBalanceValue = asString(body.colorBalance)
      aliasesInput = Array.isArray(body.aliases)
        ? body.aliases.filter((a): a is string => typeof a === 'string').join(',')
        : asString(body.aliases)
      exposures = asString(body.exposures)
    }

    if (!name) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    }

    // The caps the admin editor and the revision queue already apply to these
    // two columns, read from where they are declared. See the camera route:
    // presence was the only thing checked, on a path that writes a catalog row
    // without review.
    const limits = ADMIN_RESOURCES.films.editable
    if (name.length > limits.name.maxLength) {
      return NextResponse.json(
        { error: `Name must be ${limits.name.maxLength} characters or fewer` },
        { status: 400 }
      )
    }
    if (description && description.length > limits.description.maxLength) {
      return NextResponse.json(
        { error: `Description must be ${limits.description.maxLength} characters or fewer` },
        { status: 400 }
      )
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
        inferProcessFields({ name, description: null }).process
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

    // Both are required and undefaulted in the schema, so a new stock has to
    // arrive with a claim about them. The form does not ask yet, so this
    // proposes a starting point from what it does collect — see
    // defaultFilmAxes, which is explicitly a default and not an answer.
    const axes = defaultFilmAxes(resolvedProcess)

    // The form collects one name and calls it the manufacturer. That name is
    // what appears on the box, so it is the brand.
    const brandRecord = await resolveBrand(resolvedManufacturer)
    if (!brandRecord) {
      return NextResponse.json({ error: 'Could not resolve a brand for this stock' }, { status: 400 })
    }

    /**
     * The picture is stored before the row exists, and the row is written
     * once with everything on it. See the camera route: created-then-updated
     * meant an undecodable image answered "Failed to create film stock" with
     * the stock already created, public, and carrying neither the description
     * nor the picture submitted with it.
     */
    let imageUrl: string | null = null
    if (hasImageData && imageFile) {
      const { uploadToOSS } = await import('@/lib/oss')
      const { processItemImage } = await import('@/lib/imageProcessing')

      const buffer = Buffer.from(await imageFile.arrayBuffer())
      const processedBuffer = await processItemImage(buffer)
      imageUrl = await uploadToOSS(processedBuffer, generateImageKey('filmstock', randomUUID()))
    }

    try {
      const filmStock = await prisma.filmStock.create({
      data: {
        name,
        brand,
        manufacturer: resolvedManufacturer,
        brandId: brandRecord.id,
        // UNKNOWN, not SAME_AS_BRAND. The submitter named the brand; nobody has
        // said who coats it. SAME_AS_BRAND would assert that the brand does,
        // which is false for every respool and rebadge and is exactly the claim
        // this column exists to stop making by default. UNKNOWN is a to-do
        // item; a wrong attribution is permanent damage.
        manufacturerStatus: 'UNKNOWN',
        slug: await allocateSlug('filmstock', name, brand),
        iso,
        chromaticity: axes.chromaticity,
        polarity: axes.polarity,
        exposures,
        format: format ? [format] : [],
        process: resolvedProcess,
        colorBalance,
        aliases: normalizeAliases(aliasesInput ? aliasesInput.split(',') : []),
        description,
        // A new entry is not moderated, so its own picture is approved on
        // arrival. Unchanged, including for a description with no image.
        ...(imageUrl
          ? {
              imageUrl,
              imageStatus: 'approved',
              imageUploadedBy: userId,
              imageUploadedAt: new Date(),
            }
          : description
            ? { imageStatus: 'approved' }
            : {}),
      }
      })

      return NextResponse.json(filmStock)
    } catch (error) {
      // Stored picture, no row to account for it. Swallowed per key: this
      // runs while the request is already failing.
      if (imageUrl) {
        const key = extractKeyFromUrl(imageUrl)
        if (key) {
          const { deleteFromOSS } = await import('@/lib/oss')
          await deleteFromOSS(key).catch(() => {})
        }
      }
      throw error
    }
  } catch (error) {
    console.error('Create film stock error:', error)
    return NextResponse.json(
      { error: 'Failed to create film stock' },
      { status: 500 }
    )
  }
}
