import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { allocateSlug } from '@/lib/seo/ensureSlug'
import {
  FILM_PROCESSES,
  defaultFilmAxes,
  inferManufacturer,
  inferProcessFields,
  normalizeManufacturer,
  toFilmProcess,
} from '@/lib/filmFields'
import { readJsonObject, invalidBody, asString } from '@/lib/requestBody'
import { isUniqueViolation } from '@/lib/prismaErrors'
import { resolveBrand } from '@/lib/brands'
import { submittedCatalogFields, type FieldReader } from '@/lib/catalogWire'
import { enforceLimit } from '@/lib/rateLimit'
import { LIMITS } from '@/lib/rateLimitPolicy'
import { randomUUID } from 'crypto'
import { extractKeyFromUrl, generateImageKey } from '@/lib/ossUtils'
import { ADMIN_RESOURCES } from '@/lib/admin/resources'
import type {
  Chromaticity,
  FilmProcess,
  ManufacturerStatus,
  Polarity,
  Prisma,
} from '@prisma/client'

/** A JSON number or boolean as the text the field readers work in. */
function asNumberText(value: unknown): string | null {
  return typeof value === 'number' || typeof value === 'boolean' ? String(value) : null
}

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

  // Held outside the try so the duplicate branch below can name what was
  // submitted; everything else it needs is on the error.
  let submittedName = ''

  try {
    const contentType = req.headers.get('content-type') || ''
    let imageFile: File | null = null
    let read: FieldReader

    // Two request shapes, one list of fields; see the camera route, which had
    // the same two hand-kept copies of it.
    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData()
      imageFile = formData.get('image') as File | null
      read = field => {
        const value = formData.get(field)
        return typeof value === 'string' ? value : null
      }
    } else {
      const body = await readJsonObject(req)
      if (!body) return invalidBody()
      read = field => {
        const value = body[field]
        if (Array.isArray(value)) {
          return value.filter((v): v is string => typeof v === 'string').join(',')
        }
        return asString(value) ?? asNumberText(value)
      }
    }

    const name = read('name')?.trim() ?? ''
    submittedName = name
    const description = read('description')?.trim() || undefined
    const hasImageData = !!imageFile

    if (!name) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    }

    const limits = ADMIN_RESOURCES.films.editable
    if (description && description.length > limits.description.maxLength) {
      return NextResponse.json(
        { error: `Description must be ${limits.description.maxLength} characters or fewer` },
        { status: 400 }
      )
    }

    // Every other field, against the one allowlist. See the camera route.
    const submitted = submittedCatalogFields('films', read)
    if ('error' in submitted) {
      return NextResponse.json({ error: submitted.error }, { status: 400 })
    }

    // The brand is required; fall back to reading it off the name so an older
    // client that does not send one still produces a complete row. The column
    // is called `manufacturer` and the form asks for the name on the box.
    const submittedBrand = typeof submitted.data.manufacturer === 'string'
      ? submitted.data.manufacturer
      : null
    const resolvedManufacturer = submittedBrand
      ? normalizeManufacturer(submittedBrand)
      : inferManufacturer(name)
    if (!resolvedManufacturer) {
      return NextResponse.json(
        { error: 'A brand is required and could not be read from the name' },
        { status: 400 }
      )
    }

    // The column is NOT NULL, and the form marks this field required — but the
    // form is the only thing that was enforcing it, so a request without one
    // reached Prisma and failed on the constraint. Falls back to reading the
    // film type the same way the backfill did, so an older client that does
    // not send the field still produces a valid row.
    const resolvedProcess =
      (submitted.data.process as FilmProcess | undefined) ??
      toFilmProcess(inferProcessFields({ name, description: null }).process)
    if (!resolvedProcess) {
      return NextResponse.json(
        { error: `Process is required and must be one of ${FILM_PROCESSES.join(', ')}` },
        { status: 400 }
      )
    }

    const userId = (session.user as { id: string }).id

    // Both are required and undefaulted in the schema, so a new stock has to
    // arrive with a claim about them. The form asks now, and this is the
    // fallback for a submission that leaves them blank — see defaultFilmAxes,
    // which is explicitly a default and not an answer.
    const axes = defaultFilmAxes(resolvedProcess)

    // The name the form collects is the name on the box, so it is the brand.
    // Approving an edit to it resolves the relation the same way; see
    // reviewRevision.
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
        // Everything the form collected, in the shape each column takes. See
        // the camera route: the two hand-parsed lists this replaces are where
        // fields the dialog asked for went to die.
        ...(submitted.data as Prisma.FilmStockUncheckedCreateInput),
        name,
        manufacturer: resolvedManufacturer,
        brandId: brandRecord.id,
        // UNKNOWN, not SAME_AS_BRAND, when the form does not say. The
        // submitter named the brand; nobody has said who coats it.
        // SAME_AS_BRAND would assert that the brand does, which is false for
        // every respool and rebadge and is exactly the claim this column
        // exists to stop making by default. UNKNOWN is a to-do item; a wrong
        // attribution is permanent damage.
        manufacturerStatus: (submitted.data.manufacturerStatus as ManufacturerStatus) ?? 'UNKNOWN',
        slug: await allocateSlug('filmstock', name, null),
        chromaticity: (submitted.data.chromaticity as Chromaticity) ?? axes.chromaticity,
        polarity: (submitted.data.polarity as Polarity) ?? axes.polarity,
        process: resolvedProcess,
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
    // FilmStock.name is unique, and the duplicate check the dialog runs is
    // advisory: it fires on blur and matches loosely, so a fast submit or a
    // different spelling reaches this. Answering 500 "Failed to create film
    // stock" told someone who had just filled in a whole form and a box shot
    // that the server was broken, when the stock they wanted already exists.
    if (isUniqueViolation(error)) {
      const existing = await prisma.filmStock.findFirst({
        where: { name: { equals: submittedName, mode: 'insensitive' } },
        select: { slug: true, name: true },
      })
      return NextResponse.json(
        {
          error: `${existing?.name ?? submittedName} is already in the catalog.`,
          // The caller can offer a way to it rather than only refusing.
          slug: existing?.slug ?? null,
        },
        { status: 409 }
      )
    }

    console.error('Create film stock error:', error)
    return NextResponse.json(
      { error: 'Failed to create film stock' },
      { status: 500 }
    )
  }
}
