import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { processImage } from '@/lib/image'
import { randomUUID } from 'crypto'
import { safeExtension } from '@/lib/ossUtils'
import { validateFileSize, validateImageType, VALIDATION_LIMITS } from '@/lib/validation'
import { enforceLimit } from '@/lib/rateLimit'
import { LIMITS } from '@/lib/rateLimitPolicy'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const currentUserId = (session.user as { id: string }).id

  // Per account rather than per address, so a shared connection is not a
  // shared allowance. Applied before the body is read: parsing a multipart
  // upload is itself the expensive part.
  const limited = enforceLimit(
    'upload', currentUserId, LIMITS.upload.perUser,
    'Too many uploads in a short time. Please wait a little and continue.'
  )
  if (limited) return limited

  const formData = await req.formData()
  const files = formData.getAll('files') as File[]
  const caption = formData.get('caption') as string | null
  const cameraId = formData.get('cameraId') as string | null
  const filmStockId = formData.get('filmStockId') as string | null
  const takenDateStr = formData.get('takenDate') as string | null
  const takenDate = takenDateStr ? new Date(takenDateStr + 'T00:00:00Z') : null
  const asUserId = formData.get('asUserId') as string | null

  if (!files.length) {
    return NextResponse.json({ error: 'No files' }, { status: 400 })
  }

  if (files.length > VALIDATION_LIMITS.MAX_FILES_PER_UPLOAD) {
    return NextResponse.json(
      { error: `Please upload at most ${VALIDATION_LIMITS.MAX_FILES_PER_UPLOAD} photos at a time.` },
      { status: 400 }
    )
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
  const failed: Array<{ name: string; error: string }> = []

  for (const file of files) {
    const id = randomUUID()
    const ext = safeExtension(file.name)

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

    try {
      const buffer = Buffer.from(await file.arrayBuffer())
      const { originalPath, mediumPath, thumbnailPath, width, height, blurHash, originalBytes } =
        await processImage(buffer, id, ext)

      const photo = await prisma.photo.create({
        data: {
          id,
          userId: targetUserId,
          originalPath,
          mediumPath,
          thumbnailPath,
          blurHash,
          width,
          height,
          originalBytes,
          caption,
          cameraId: validCameraId,
          filmStockId: validFilmStockId,
          takenDate
        }
      })
      photos.push(photo)
    } catch (error) {
      console.error(`[Upload] Failed to process "${file.name}":`, error)
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

/**
 * Turn a processing failure into something a person can act on.
 *
 * sharp reports an unreadable or unsupported file as "Input buffer contains
 * unsupported image format", which tells the uploader nothing about what to do.
 */
function describeUploadError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)

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
