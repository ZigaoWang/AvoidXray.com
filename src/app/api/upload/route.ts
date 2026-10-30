import { NextRequest, NextResponse } from 'next/server'
import { Saturated, withRenderSlot } from '@/lib/watermark/serverPipeline'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { identifyOriginal, processImage } from '@/lib/image'
import { randomUUID } from 'crypto'
import { deleteFromOSS } from '@/lib/oss'
import { isTooLarge } from '@/lib/sharpConfig'
import { validateFileSize, validateImageType, VALIDATION_LIMITS } from '@/lib/validation'
import { enforceLimit } from '@/lib/rateLimit'
import { LIMITS } from '@/lib/rateLimitPolicy'
import { refuseOversizedBody, readFormData, invalidBody } from '@/lib/requestBody'
import { hasBlockedWords, blockedWordsMessage } from '@/lib/wordFilter'
import { screenImage } from '@/lib/visionScreen'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'Sign in to do that' }, { status: 401 })
  }

  const currentUserId = (session.user as { id: string }).id

  // Per account rather than per address, so a shared connection is not a
  // shared allowance. Applied before the body is read: parsing a multipart
  // upload is itself the expensive part.
  const limited = enforceLimit(
    'upload', currentUserId, LIMITS.upload.perUser,
    'Too many uploads in a short time. Please wait a little and continue.'
  ) ?? enforceLimit(
    'upload-day', currentUserId, LIMITS.upload.perUserDaily,
    'That is the most uploads one account can make in a day. The rest can go up tomorrow.'
  )
  if (limited) return limited

  const oversized = refuseOversizedBody(
    req,
    VALIDATION_LIMITS.MAX_UPLOAD_BODY_MB * 1024 * 1024,
    `That upload is too large. Send at most ${VALIDATION_LIMITS.MAX_UPLOAD_BODY_MB}MB in one request.`
  )
  if (oversized) return oversized

  const formData = await readFormData(req)
  if (!formData) return invalidBody()
  const files = formData.getAll('files') as File[]
  const caption = formData.get('caption')
  const cameraId = formData.get('cameraId') as string | null
  const filmStockId = formData.get('filmStockId') as string | null
  const takenDateStr = formData.get('takenDate') as string | null
  const takenDate = takenDateStr ? new Date(takenDateStr + 'T00:00:00Z') : null
  const asUserId = formData.get('asUserId') as string | null

  if (!files.length) {
    return NextResponse.json({ error: 'No files' }, { status: 400 })
  }

  // Checked before any file is processed. An unreadable date otherwise failed
  // each insert after its images had been resized and stored.
  if (takenDate && Number.isNaN(takenDate.getTime())) {
    return NextResponse.json({ error: 'That date could not be read' }, { status: 400 })
  }

  if (files.length > VALIDATION_LIMITS.MAX_FILES_PER_UPLOAD) {
    return NextResponse.json(
      { error: `Please upload at most ${VALIDATION_LIMITS.MAX_FILES_PER_UPLOAD} photos at a time.` },
      { status: 400 }
    )
  }

  // The same cap PATCH /api/photos/[id] applies, checked here because the
  // caption arrives with the upload and is written by this route. The body
  // gate above only bounds the whole multipart request, and the feed
  // serializes every scalar on a photo, so an unbounded caption is paid for
  // by everyone who loads the feed rather than by the uploader.
  if (caption !== null) {
    if (typeof caption !== 'string') {
      return NextResponse.json({ error: 'Caption must be text' }, { status: 400 })
    }
    if (caption.length > VALIDATION_LIMITS.MAX_CAPTION_LENGTH) {
      return NextResponse.json(
        { error: `Caption must be ${VALIDATION_LIMITS.MAX_CAPTION_LENGTH} characters or fewer` },
        { status: 400 }
      )
    }
    if (hasBlockedWords(caption, 'text')) {
      return NextResponse.json({ error: blockedWordsMessage('The caption') }, { status: 400 })
    }
  }

  // Determine target user ID (admin can upload as another user)
  let targetUserId = currentUserId

  if (asUserId && asUserId !== currentUserId) {
    // Verify current user is admin
    const currentUser = await prisma.user.findUnique({ where: { id: currentUserId } })
    if (!currentUser?.isAdmin) {
      return NextResponse.json({ error: 'Only admins can upload as another user' }, { status: 403 })
    }

    // Verify target user exists
    const targetUser = await prisma.user.findUnique({ where: { id: asUserId } })
    if (!targetUser) {
      return NextResponse.json({ error: 'Target user not found' }, { status: 404 })
    }

    targetUserId = asUserId
  }

  const photos = []

  // Validate foreign keys exist
  let validCameraId = null
  let validFilmStockId = null

  if (cameraId) {
    const camera = await prisma.camera.findUnique({ where: { id: cameraId } })
    if (camera) validCameraId = cameraId
  }

  if (filmStockId) {
    const film = await prisma.filmStock.findUnique({ where: { id: filmStockId } })
    if (film) validFilmStockId = filmStockId
  }

  // Each file is handled independently. Previously a single unreadable image
  // threw out of the loop and failed the whole request with a 500 — while any
  // photos already created in earlier iterations stayed in the database, so the
  // uploader saw an error for files that had in fact been saved.
  // `code` names a failure the page handles differently from the rest: a
  // photo the nudity check refused can be sent again for an admin's review.
  const failed: Array<{ name: string; error: string; code?: 'nudity' }> = []

  // The uploader saying the check was wrong. The photo is then stored as held:
  // only they and admins can see it until an admin decides.
  const askingForReview = formData.get('review') === '1'

  for (const file of files) {
    const id = randomUUID()

    // Rejected per file rather than per request, matching how processing
    // failures are already reported: one unusable file in a drop of thirty
    // should not throw away the other twenty-nine.
    //
    // Only a type that is present and wrong is refused. Browsers hand over an
    // empty type for HEIC often enough that treating "unknown" as "not an
    // image" would turn away ordinary iPhone uploads; those fall through to
    // sharp, which is what actually decides whether the bytes are an image.
    if (file.type && !validateImageType(file.type)) {
      failed.push({ name: file.name, error: 'This is not an image file.' })
      continue
    }

    if (!validateFileSize(file.size, VALIDATION_LIMITS.MAX_PHOTO_SIZE_MB)) {
      failed.push({
        name: file.name,
        error: `Larger than the ${VALIDATION_LIMITS.MAX_PHOTO_SIZE_MB}MB limit. Try exporting at a lower resolution.`,
      })
      continue
    }

    /**
     * What processImage put in the bucket, so a failure after it can take it
     * back out.
     *
     * The three derivatives are uploaded before the row that accounts for them
     * exists, and nothing between those two steps is atomic. A create that
     * throws — a dropped connection, a constraint, this box running out of
     * memory partway through a drop of thirty — used to report the failure to
     * the uploader and leave an original, a medium and a thumbnail in storage
     * with nothing pointing at them. They were reclaimable only by an
     * administrator remembering to run the orphan sweep.
     */
    let stored: string[] = []

    try {
      // Identified once, here: a HEIC is decoded for the check below and the
      // display versions, and stored as it was sent.
      const buffer = Buffer.from(await file.arrayBuffer())
      const original = await identifyOriginal(buffer)

      // Checked before anything is stored, so a photo the nudity check flags
      // never reaches the bucket. When the check cannot run, the photo is
      // stored as pending and the vision worker checks it afterwards.
      const screen = await screenImage(original.source)
      if (screen?.hold && !askingForReview) {
        failed.push({ name: file.name, error: NUDITY_REFUSED, code: 'nudity' })
        continue
      }

      // Under a render slot like exports: three full-size encodes per photo,
      // and a drop of thirty ran beside every export with nothing counting it.
      // Stored private until it is published: the owner may still choose
      // Private before then. Publishing moves them (photoStorage.ts).
      const processed = await withRenderSlot(false, () => processImage(buffer, original, id, { imagesPublic: false }))
      stored = processed.keys

      const photo = await prisma.photo.create({
        data: {
          id,
          userId: targetUserId,
          ...processed.data,
          originalFilename: file.name.slice(0, 255),
          caption,
          cameraId: validCameraId,
          filmStockId: validFilmStockId,
          takenDate,
          ...(screen
            ? { screening: screen.hold ? 'HELD' as const : 'CLEAR' as const, nudityScore: screen.score, nudityModel: screen.model }
            : {}),
        }
      })
      photos.push(photo)
    } catch (error) {
      console.error(`[Upload] Failed to process "${file.name}":`, error)

      // Best effort, and swallowed per key on purpose: this runs while an
      // upload is already failing, and a delete that cannot find its object
      // has nothing to report. What matters is not adding storage nobody can
      // account for on top of the error being returned.
      await Promise.all(stored.map(key => deleteFromOSS(key).catch(() => {})))

      failed.push({ name: file.name, error: describeUploadError(error) })
    }
  }

  // Nothing succeeded: report it as an error rather than a hollow success.
  if (photos.length === 0 && failed.length > 0) {
    return NextResponse.json(
      { error: failed[0].error, failed, photos: [] },
      { status: 422 }
    )
  }

  return NextResponse.json({ photos, failed })
}

/** Shown on the photo in the upload page. Says what to do if the check is wrong. */
const NUDITY_REFUSED = 'This photo looks like it contains nudity, so it was not uploaded.'

/**
 * Turn a processing failure into something a person can act on.
 *
 * sharp reports an unreadable or unsupported file as "Input buffer contains
 * unsupported image format", which tells the uploader nothing about what to do.
 */
function describeUploadError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)

  if (error instanceof Saturated) {
    return 'The server is busy processing other photos. Try this one again in a minute.'
  }
  // Checked before the generic "unsupported format" branch, which would
  // otherwise claim a perfectly good scan was unreadable.
  if (isTooLarge(error)) {
    return 'This image has too many pixels for us to process. Try exporting it at a smaller resolution.'
  }
  if (/unsupported image format|Input buffer/i.test(message)) {
    return 'File is not a readable image, or uses a format we cannot process. Try exporting it as JPEG, PNG, or WebP.'
  }
  if (/HEIC|HEIF/i.test(message)) {
    return 'This HEIC file could not be converted. Try exporting it as JPEG before uploading.'
  }
  if (/timeout|ETIMEDOUT|ECONNRESET/i.test(message)) {
    return 'Upload to storage timed out. Please try again.'
  }
  return 'Could not process this image. Please try a different file.'
}
