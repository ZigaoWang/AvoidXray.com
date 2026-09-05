import sharp from 'sharp'
import { encode } from 'blurhash'
import { uploadToOSS } from './oss'
import heicDecode from 'heic-decode'
import exifr from 'exifr'
import { SHARP_INPUT, MAX_HEIC_PIXELS } from './sharpConfig'

/**
 * A HEIC/HEIF buffer as a PNG, refusing anything too large to hold.
 *
 * This runs before the first `sharp()` call, so the pixel ceiling that
 * protects every other path does not apply to it. Left unbounded, libheif
 * allocated `width * height * 4` bytes for any dimensions the file declared
 * and the process was one crafted upload away from being killed on a 2GB box.
 *
 * `all()` reads each frame's dimensions out of the container without decoding
 * it, which is what makes the check possible: the size is known before
 * anything is allocated, so an oversized file costs a header parse rather than
 * the memory it was asking for.
 *
 * The encode goes through sharp rather than heic-convert's, which is pngjs
 * writing at deflate level 9 — synchronous, and long enough on a large raster
 * to stall every other request on this single-process server.
 */
async function convertHeicToPng(buffer: Buffer): Promise<Buffer> {
  const images = await heicDecode.all({ buffer })
  try {
    if (images.length === 0) throw new Error('HEIF image not found')

    const { width, height } = images[0]
    // Phrased to match isTooLarge, so an oversized HEIC gets the same message
    // as an oversized anything else rather than reading as a broken file.
    if (width * height > MAX_HEIC_PIXELS) {
      throw new Error(`Input image exceeds pixel limit: ${width}x${height}`)
    }

    const { data } = await images[0].decode()
    return await sharp(Buffer.from(data.buffer, data.byteOffset, data.byteLength), {
      raw: { width, height, channels: 4 },
      ...SHARP_INPUT,
    })
      .png()
      .toBuffer()
  } finally {
    // Frees the libheif handles whether or not the decode was attempted.
    images.dispose()
  }
}

/**
 * Check if buffer is HEIC/HEIF format by checking magic bytes
 */
function isHeicBuffer(buffer: Buffer): boolean {
  // HEIC/HEIF files have 'ftyp' at offset 4 and contain 'heic', 'heix', 'hevc', 'hevx', 'mif1', or 'msf1'
  if (buffer.length < 12) return false

  const ftypMarker = buffer.toString('ascii', 4, 8)
  if (ftypMarker !== 'ftyp') return false

  const brand = buffer.toString('ascii', 8, 12).toLowerCase()
  const heicBrands = ['heic', 'heix', 'hevc', 'hevx', 'mif1', 'msf1']
  return heicBrands.some(b => brand.includes(b.substring(0, brand.length)))
}

/**
 * Removes location from a file that carries it.
 *
 * The stored original is the file as uploaded, and it is publicly downloadable
 * from the photo page, so any GPS in it is public too. Lab scans carry the
 * scanner's details and no location, but a phone photograph of a print
 * usually does carry it, and that can be someone's home.
 *
 * Files without GPS are returned untouched, which is the overwhelming
 * majority, so nothing is re-encoded needlessly. Files with it are re-encoded
 * through sharp, which drops all metadata.
 */
export async function stripLocation(buffer: Buffer, ext: string): Promise<Buffer> {
  let hasGps = false
  try {
    const gps = await exifr.gps(buffer)
    hasGps = gps?.latitude != null && gps?.longitude != null
  } catch {
    // Unreadable metadata is not a reason to reject an upload.
    return buffer
  }
  if (!hasGps) return buffer

  const image = sharp(buffer, SHARP_INPUT).rotate()
  const encoded =
    ext === 'png' ? await image.png().toBuffer() : await image.jpeg({ quality: 95 }).toBuffer()
  console.log(`[Image] Stripped GPS from an upload (${buffer.length} -> ${encoded.length} bytes)`)
  return encoded
}

export async function processImage(buffer: Buffer, id: string, originalExt: string = 'jpg') {
  // Convert HEIC to PNG if needed (lossless conversion)
  let processableBuffer = buffer
  let actualExt = originalExt.toLowerCase()

  if (actualExt === 'heic' || actualExt === 'heif' || isHeicBuffer(buffer)) {
    try {
      console.log(`[Image] Converting HEIC/HEIF to PNG (lossless) for ${id}`)
      processableBuffer = await convertHeicToPng(buffer)
      actualExt = 'png'
    } catch (error) {
      console.error(`[Image] Failed to convert HEIC/HEIF:`, error)
      throw new Error('Failed to process HEIC/HEIF image. Please convert to JPEG or PNG before uploading.')
    }
  }

  // SHARP_INPUT bounds the decoded size. It belongs on the first call in
  // particular: that is where an image the machine cannot afford to hold gets
  // turned into pixels, and refusing it there costs nothing.
  const rotatedBuffer = await sharp(processableBuffer, SHARP_INPUT).rotate().toBuffer()
  const metadata = await sharp(rotatedBuffer, SHARP_INPUT).metadata()
  const width = metadata.width || 0
  const height = metadata.height || 0

  // Generate blurhash from a small version of the image
  const { data, info } = await sharp(rotatedBuffer, SHARP_INPUT)
    .resize(32, 32, { fit: 'inside' })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })

  const blurHash = encode(new Uint8ClampedArray(data), info.width, info.height, 4, 3)

  // Sequential rather than concurrent. These ran under Promise.all, which put
  // two full-size decodes in flight at once — on a 2GB machine that doubled
  // the peak for the largest uploads to save a few hundred milliseconds on an
  // operation already measured in seconds.
  const mediumBuffer = await sharp(rotatedBuffer, SHARP_INPUT)
    .resize(1600, 1600, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 80 })
    .toBuffer()
  const thumbBuffer = await sharp(rotatedBuffer, SHARP_INPUT)
    .resize(800, 800, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 75 })
    .toBuffer()

  // Derivatives are re-encoded by sharp, which drops metadata, so only the
  // stored original needs this.
  const originalToStore = await stripLocation(processableBuffer, actualExt)

  // Upload all in parallel (original as lossless PNG if converted from HEIC, others as webp for display)
  const [originalPath, mediumPath, thumbnailPath] = await Promise.all([
    uploadToOSS(originalToStore, `originals/${id}.${actualExt}`),
    uploadToOSS(mediumBuffer, `medium/${id}.webp`),
    uploadToOSS(thumbBuffer, `thumbs/${id}.webp`),
  ])

  return {
    originalPath,
    mediumPath,
    thumbnailPath,
    width,
    height,
    blurHash,
    // What actually gets uploaded as the original, after HEIC conversion and
    // any GPS stripping.
    originalBytes: originalToStore.length,
  }
}
