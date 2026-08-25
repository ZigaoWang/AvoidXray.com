import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { uploadToOSS } from '@/lib/oss'
import { validateFileSize, validateImageType, VALIDATION_LIMITS } from '@/lib/validation'
import { randomUUID } from 'crypto'
import sharp from 'sharp'

/**
 * Longest edge of a stored avatar.
 *
 * Avatars render between 20px and 96px across, so this leaves headroom for a
 * high-DPI screen and nothing more. The uploaded file used to be stored
 * untouched at whatever size it arrived.
 */
const AVATAR_MAX_EDGE = 512

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const formData = await req.formData()
  const file = formData.get('file')
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: 'No file' }, { status: 400 })
  }

  // A type that is present and wrong is refused early; an absent one — which
  // is common for HEIC — falls through to sharp below, which is what actually
  // establishes whether the bytes are an image.
  if (file.type && !validateImageType(file.type)) {
    return NextResponse.json({ error: 'Please choose an image file.' }, { status: 400 })
  }

  if (!validateFileSize(file.size, VALIDATION_LIMITS.MAX_IMAGE_SIZE_MB)) {
    return NextResponse.json(
      { error: `Image must be smaller than ${VALIDATION_LIMITS.MAX_IMAGE_SIZE_MB}MB.` },
      { status: 400 }
    )
  }

  const buffer = Buffer.from(await file.arrayBuffer())

  // Re-encoded rather than stored as sent. The declared Content-Type is the
  // client's word and the extension came from the uploaded filename, so any
  // bytes under any name could be parked on the bucket. Decoding through sharp
  // is what actually establishes the file is an image, and the output key is
  // ours, so the caller no longer picks how the object is served.
  let processed: Buffer
  try {
    processed = await sharp(buffer)
      .rotate()
      .resize(AVATAR_MAX_EDGE, AVATAR_MAX_EDGE, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 85 })
      .toBuffer()
  } catch (error) {
    console.error('[Avatar] Could not process upload:', error)
    return NextResponse.json(
      { error: 'That file is not a readable image. Try a JPEG or PNG.' },
      { status: 400 }
    )
  }

  // The previous avatar is deleted by PATCH /api/user, once the new URL has
  // actually been saved. Removing it here left the account pointing at a
  // deleted object whenever the save that follows this call did not land.
  const path = await uploadToOSS(processed, `avatars/${randomUUID()}.webp`)

  return NextResponse.json({ path })
}
