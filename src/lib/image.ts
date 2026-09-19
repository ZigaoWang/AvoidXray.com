import sharp from 'sharp'
import { encode } from 'blurhash'
import { uploadToOSS } from './oss'
import heicDecode from 'heic-decode'
import exifr from 'exifr'
import { SHARP_INPUT, MAX_HEIC_PIXELS, isTooLarge, JPEG_OUTPUT } from './sharpConfig'

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
 * A buffer sharp can read: HEIC/HEIF becomes PNG, anything else is passed
 * through untouched. The returned extension is what the result should be
 * stored under, so it is `png` whenever a conversion happened.
 *
 * The extension is only what the uploader's filename claimed, so the magic
 * bytes are consulted too: browsers send HEIC with an empty type often enough,
 * and a caller working from a bare buffer can leave the extension out.
 */
export async function convertHeicIfNeeded(
  buffer: Buffer,
  ext: string = ''
): Promise<{ buffer: Buffer; ext: string }> {
  if (ext !== 'heic' && ext !== 'heif' && !isHeicBuffer(buffer)) return { buffer, ext }

  console.log('[Image] Converting HEIC/HEIF to PNG (lossless)')
  try {
    return { buffer: await convertHeicToPng(buffer), ext: 'png' }
  } catch (error) {
    console.error('[Image] Failed to convert HEIC/HEIF:', error)
    // An oversized HEIC is a size problem, and callers already have wording for
    // that. Flattening it into a format failure told someone with a 200MP file
    // to export it as JPEG, which leaves the pixel count exactly where it was.
    if (isTooLarge(error)) throw error
    throw new Error('Failed to process HEIC/HEIF image. Please convert to JPEG or PNG before uploading.')
  }
}

/**
 * Whether an XMP packet in the file names a location.
 *
 * `exifr.gps` reads the EXIF GPS IFD and nothing else, so a file whose only
 * coordinates live in XMP answered "no location" and was stored untouched.
 * Lightroom and several phone makers write there as well as, or instead of,
 * the GPS IFD. XMP is plain XML embedded in the file, so the tags are findable
 * as text without parsing the container.
 *
 * Only the head of the file is searched: an XMP packet sits in the metadata
 * segments near the start, and scanning tens of megabytes of pixel data for a
 * string would cost more than the re-encode it is trying to avoid. A false
 * positive costs one re-encode, which is the cheap direction to be wrong in.
 */
function hasXmpLocation(buffer: Buffer): boolean {
  const head = buffer.subarray(0, Math.min(buffer.length, 256 * 1024)).toString('latin1')
  return /GPSLatitude|GPSLongitude|exif:GPS/i.test(head)
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
  let mustStrip: boolean
  try {
    const gps = await exifr.gps(buffer)
    mustStrip = (gps?.latitude != null && gps?.longitude != null) || hasXmpLocation(buffer)
  } catch {
    // Metadata that will not parse is not the same answer as metadata that
    // holds no location, and this used to return the file untouched for both.
    // A privacy control that fails open publishes the coordinates it exists to
    // remove, so an unreadable answer is treated as a yes and the file is
    // re-encoded. That costs a re-encode on an unusual file and leaks nothing.
    mustStrip = true
  }
  if (!mustStrip) return buffer

  try {
    const image = sharp(buffer, SHARP_INPUT).rotate()
    const encoded =
      ext === 'png' ? await image.png().toBuffer() : await image.jpeg({ ...JPEG_OUTPUT, quality: 95 }).toBuffer()
    console.log(`[Image] Stripped location from an upload (${buffer.length} -> ${encoded.length} bytes)`)
    return encoded
  } catch {
    // Nothing sharp can decode is nothing that carries image metadata, so
    // there is no location here to publish. Returned as it arrived, and
    // refused further up by the validation that decides what an image is:
    // unreadable bytes must not cost somebody their upload.
    return buffer
  }
}

export async function processImage(buffer: Buffer, id: string, originalExt: string = 'jpg') {
  const { buffer: processableBuffer, ext: actualExt } = await convertHeicIfNeeded(
    buffer,
    originalExt.toLowerCase()
  )

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
