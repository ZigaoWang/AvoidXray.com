import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import type { Prisma } from '@prisma/client'
import { allocateSlug } from '@/lib/seo/ensureSlug'
import { readJsonObject, invalidBody, asString } from '@/lib/requestBody'
import { resolveBrand } from '@/lib/brands'
import { submittedCatalogFields, type FieldReader } from '@/lib/catalogWire'
import { enforceLimit } from '@/lib/rateLimit'
import { LIMITS } from '@/lib/rateLimitPolicy'
import { randomUUID } from 'crypto'
import { extractKeyFromUrl, generateImageKey } from '@/lib/ossUtils'
import { ADMIN_RESOURCES } from '@/lib/admin/resources'

/** A JSON number or boolean as the text the field readers work in. */
function asNumberText(value: unknown): string | null {
  return typeof value === 'number' || typeof value === 'boolean' ? String(value) : null
}

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
    let imageFile: File | null = null
    let read: FieldReader

    // Two request shapes, one list of fields. Each branch parsed its own copy
    // of that list, so a field the form collected could reach one and not the
    // other — and the list itself was a third place a new field had to be
    // named. Now both branches do nothing but say how to read one key.
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

    // `cameraType` is the name this endpoint has always taken the body type
    // under, and a client built against it is still entitled to send it. The
    // column it writes has been `bodyType` for some time.
    const readField: FieldReader = field =>
      read(field) ?? (field === 'bodyType' ? read('cameraType') : null)

    const name = readField('name')?.trim() ?? ''
    const description = readField('description')?.trim() || undefined
    const hasImageData = !!imageFile

    if (!name) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    }

    // Every other field, checked and coerced against the one allowlist — the
    // same one the revision pipeline applies at approval, so a value this
    // route accepts is a value an edit to it could propose. The description is
    // not in that list, so its own cap is read from the same declaration.
    const limits = ADMIN_RESOURCES.cameras.editable
    if (description && description.length > limits.description.maxLength) {
      return NextResponse.json(
        { error: `Description must be ${limits.description.maxLength} characters or fewer` },
        { status: 400 }
      )
    }

    const submitted = submittedCatalogFields('cameras', readField)
    if ('error' in submitted) {
      return NextResponse.json({ error: submitted.error }, { status: 400 })
    }
    const brand = typeof submitted.data.brand === 'string' ? submitted.data.brand : undefined

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
          // Everything the form collected, already the shape each column
          // takes. A control the shared form grows is written here without
          // this route being touched, which is what the frame format needed:
          // the add dialog has always asked for it and no camera ever
          // arrived with one.
          ...(submitted.data as Prisma.CameraUncheckedCreateInput),
          name,
          brandId: brandRecord?.id,
          slug: await allocateSlug('camera', name, brand),
          addedById: userId,
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
