import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { allocateSlug } from '@/lib/seo/ensureSlug'
import { readJsonObject, invalidBody, asString, asInt } from '@/lib/requestBody'
import { toBodyType, toFrameFormat } from '@/lib/cameraFields'
import { normalizeAliases } from '@/lib/filmFields'
import { resolveBrand } from '@/lib/brands'
import { enforceLimit } from '@/lib/rateLimit'
import { LIMITS } from '@/lib/rateLimitPolicy'
import { randomUUID } from 'crypto'
import { extractKeyFromUrl, generateImageKey } from '@/lib/ossUtils'

export async function GET() {
  // The columns the callers actually read, not every column on the row.
  //
  // This returned the whole table with `findMany()` and no select, so every
  // visit to /upload, /manage or a photo edit page pulled each camera's
  // description and its twenty spec columns to fill a picker that shows a
  // name, a maker and a thumbnail. The catalog is small today and the cost
  // grows with it.
  const cameras = await prisma.camera.findMany({
    select: {
      id: true,
      slug: true,
      name: true,
      brand: true,
      aliases: true,
      imageUrl: true,
      imageStatus: true,
      cameraType: true,
      bodyType: true,
      defaultFilmStockId: true,
    },
    orderBy: { name: 'asc' },
  })

  // An image still under review is nobody's business but the moderators'.
  const sanitized = cameras.map(({ imageStatus, ...camera }) => ({
    ...camera,
    imageUrl: imageStatus === 'approved' ? camera.imageUrl : null,
  }))

  return NextResponse.json(sanitized)
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const userId = (session.user as { id: string }).id

  const limited = enforceLimit(
    'catalogCreate', userId, LIMITS.catalogCreate.perUser,
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
    let hasImageData = false
    let imageFile: File | null = null
    let description: string | undefined
    let cameraType: string | undefined
    let format: string | undefined
    let year: number | undefined
    let frameFormat: string | undefined
    let defaultFilmStockId: string | undefined
    let aliasesInput: string | undefined

    // Check if it's FormData (with image) or JSON (without image)
    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData()
      name = formData.get('name') as string
      brand = (formData.get('brand') as string) || undefined
      imageFile = formData.get('image') as File | null
      description = (formData.get('description') as string) || undefined
      cameraType = (formData.get('cameraType') as string) || undefined
      format = (formData.get('format') as string) || undefined
      year = asInt(formData.get('year'))
      frameFormat = (formData.get('frameFormat') as string) || undefined
      defaultFilmStockId = (formData.get('defaultFilmStockId') as string) || undefined
      aliasesInput = (formData.get('aliases') as string) || undefined
      hasImageData = !!imageFile
    } else {
      const body = await readJsonObject(req)
      if (!body) return invalidBody()
      name = asString(body.name) ?? ''
      brand = asString(body.brand)
      cameraType = asString(body.cameraType)
      format = asString(body.format)
      year = asInt(body.year)
      frameFormat = asString(body.frameFormat)
      defaultFilmStockId = asString(body.defaultFilmStockId) || undefined
      aliasesInput = Array.isArray(body.aliases)
        ? body.aliases.filter((a): a is string => typeof a === 'string').join(',')
        : asString(body.aliases)
    }

    if (!name) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    }

    // An unrecognized value becomes null rather than an error: the body type is
    // optional, and null means "not yet classified" rather than "invalid".
    const bodyType = toBodyType(cameraType ?? null)

    // The brand relation, resolved the same way a film stock resolves its
    // maker. Only the free-text column was written here, so brandId was set on
    // nothing but the rows the brands migration backfilled, and camera search
    // matches brand through the relation: every body added since that
    // migration was unfindable by its maker's name.
    const brandRecord = brand?.trim() ? await resolveBrand(brand) : null

    /**
     * The picture is processed and stored before the row exists, and the row
     * is then written once with everything on it.
     *
     * It used to run the other way: create the camera, then process the
     * image, then update the row twice over. An image this machine could not
     * decode -- or object storage being briefly unreachable -- answered
     * "Failed to create camera" with the camera already created, public, and
     * carrying neither the description nor the picture that were submitted
     * with it. The person then added it again and hit the unique name.
     *
     * The key does not need the row's id: generateImageKey stamps a
     * timestamp, so a fresh token is enough to be unique.
     */
    let imageUrl: string | null = null
    if (hasImageData && imageFile) {
      const { uploadToOSS } = await import('@/lib/oss')
      const { processItemImage } = await import('@/lib/imageProcessing')

      const buffer = Buffer.from(await imageFile.arrayBuffer())
      const processedBuffer = await processItemImage(buffer)
      imageUrl = await uploadToOSS(processedBuffer, generateImageKey('camera', randomUUID()))
    }

    try {
      const camera = await prisma.camera.create({
        data: {
          name,
          brand,
          brandId: brandRecord?.id,
          slug: await allocateSlug('camera', name, brand),
          addedById: userId,
          bodyType,
          // Through the enum coercion, so a member the schema does not have is
          // dropped rather than written.
          frameFormat: toFrameFormat(frameFormat ?? null),
          // Verified against the table rather than trusted: an id from a stale
          // client would otherwise be a foreign key error at insert time.
          format,
          year,
          defaultFilmStockId,
          // Offered by the add dialog, so it has to be read here. A field a form
          // collects and an endpoint ignores is discarded without a word, which
          // this codebase has been caught doing before.
          aliases: normalizeAliases(aliasesInput ? aliasesInput.split(',') : []),
          description,
          // A new entry is not moderated, so its own picture is approved on
          // arrival. Unchanged from before, including for a submission that
          // carries a description and no image.
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

      return NextResponse.json(camera)
    } catch (error) {
      // The picture is already stored and the row that would account for it
      // is not. Swallowed per key: this runs while the request is failing.
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
    console.error('Create camera error:', error)
    return NextResponse.json(
      { error: 'Failed to create camera' },
      { status: 500 }
    )
  }
}
