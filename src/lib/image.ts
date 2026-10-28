import sharp, { type Sharp } from 'sharp'
import { encode } from 'blurhash'
import { uploadToOSS } from './oss'
import { decodeHeic } from './heicDecode'
import exifr from 'exifr'
import { stripPersonalMetadata } from './stripMetadata'
import { SHARP_INPUT, isTooLarge, JPEG_OUTPUT } from './sharpConfig'

/**
 * A HEIC/HEIF buffer as a PNG, refusing anything too large to hold.
 *
 * Decoded in a worker thread (see heicDecode.ts): libheif is WebAssembly and
 * decodes synchronously, so on this thread a large iPhone photo held every
 * other request for the whole decode. The worker checks the pixel ceiling from
 * the container's header before decoding, since libheif allocates
 * `width * height * 4` bytes for whatever dimensions a file declares, and
 * phrases the refusal to match isTooLarge.
 *
 * The PNG encode is sharp's, which runs on the libuv pool rather than here.
 */
async function convertHeicToPng(buffer: Buffer): Promise<Buffer> {
  const { data, width, height } = await decodeHeic(buffer)
  return sharp(data, { raw: { width, height, channels: 4 }, ...SHARP_INPUT }).png().toBuffer()
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
    throw new Error('Could not read that HEIC image. Convert it to JPEG or PNG and try again.')
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
 * The stored original with personal metadata removed.
 *
 * The original is publicly downloadable from the photo page. JPEG and PNG are
 * cleaned without re-encoding (see stripMetadata.ts): GPS, serial numbers,
 * names, the embedded preview, XMP and IPTC go, and the shooting details stay.
 * A file with none of those comes back byte for byte.
 *
 * Any other format is re-encoded when it carries metadata at all, which drops
 * all of it. A privacy control that fails open publishes what it exists to
 * remove, so metadata that will not parse counts as present.
 */
export async function stripPrivateMetadata(buffer: Buffer, ext: string): Promise<Buffer> {
  const cleaned = stripPersonalMetadata(buffer)
  if (cleaned) {
    if (cleaned !== buffer) console.log(`[Image] Removed personal metadata from an upload (${buffer.length} -> ${cleaned.length} bytes)`)
    return cleaned
  }

  let hasMetadata: boolean
  try {
    const parsed = await exifr.parse(buffer, { tiff: true, xmp: true, iptc: true, icc: false })
    hasMetadata = (parsed != null && Object.keys(parsed).length > 0) || hasXmpLocation(buffer)
  } catch {
    hasMetadata = true
  }
  if (!hasMetadata) return buffer

  try {
    const image = sharp(buffer, SHARP_INPUT).rotate()
    const encoded =
      ext === 'png' ? await image.png().toBuffer()
      : ext === 'webp' ? await image.webp({ quality: 95 }).toBuffer()
      : await image.jpeg({ ...JPEG_OUTPUT, quality: 95 }).toBuffer()
    console.log(`[Image] Re-encoded an upload to drop its metadata (${buffer.length} -> ${encoded.length} bytes)`)
    return encoded
  } catch {
    // Nothing sharp can decode is nothing that carries image metadata, so
    // there is nothing here to publish. Returned as it arrived, and refused
    // further up by the validation that decides what an image is: unreadable
    // bytes must not cost somebody their upload.
    return buffer
  }
}

/**
 * The extension a stored original gets, by what sharp reads the bytes as.
 *
 * It came from the uploaded filename, so `originals/<id>.html` or `.svg` could
 * be stored with image bytes or anything else sharp would decode. Formats not
 * listed are refused: SVG is a document rather than a photograph.
 */
const STORED_EXTENSIONS: Record<string, string> = {
  jpeg: 'jpg',
  png: 'png',
  webp: 'webp',
  tiff: 'tif',
  avif: 'avif',
  gif: 'gif',
}

/**
 * The two display sizes every photo gets, community upload or archive import.
 * MEDIUM_LONG_EDGE in exportFormats.ts mirrors the first.
 */
const MEDIUM = { longEdge: 1600, quality: 80 } as const
const THUMB = { longEdge: 800, quality: 75 } as const

/** A blurhash from a 32px copy, for the placeholder shown while a photo loads. */
async function blurHashOf(input: Sharp): Promise<string> {
  const { data, info } = await input
    .resize(32, 32, { fit: 'inside' })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  return encode(new Uint8ClampedArray(data), info.width, info.height, 4, 3)
}

export async function processImage(buffer: Buffer, id: string, originalExt: string = 'jpg') {
  const { buffer: processableBuffer } = await convertHeicIfNeeded(buffer, originalExt.toLowerCase())
  const { format } = await sharp(processableBuffer, SHARP_INPUT).metadata()
  const actualExt = format ? STORED_EXTENSIONS[format] : undefined
  if (!actualExt) throw new Error(`unsupported image format: ${format ?? 'unknown'}`)

  // SHARP_INPUT bounds the decoded size. It belongs on the first call in
  // particular: that is where an image the machine cannot afford to hold gets
  // turned into pixels, and refusing it there costs nothing.
  const rotatedBuffer = await sharp(processableBuffer, SHARP_INPUT).rotate().toBuffer()
  const metadata = await sharp(rotatedBuffer, SHARP_INPUT).metadata()
  const width = metadata.width || 0
  const height = metadata.height || 0

  const blurHash = await blurHashOf(sharp(rotatedBuffer, SHARP_INPUT))

  // Sequential rather than concurrent. These ran under Promise.all, which put
  // two full-size decodes in flight at once — on a 2GB machine that doubled
  // the peak for the largest uploads to save a few hundred milliseconds on an
  // operation already measured in seconds.
  const mediumBuffer = await sharp(rotatedBuffer, SHARP_INPUT)
    .resize(MEDIUM.longEdge, MEDIUM.longEdge, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: MEDIUM.quality })
    .toBuffer()
  const thumbBuffer = await sharp(rotatedBuffer, SHARP_INPUT)
    .resize(THUMB.longEdge, THUMB.longEdge, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: THUMB.quality })
    .toBuffer()

  // Derivatives are re-encoded by sharp, which drops metadata, so only the
  // stored original needs this.
  const originalToStore = await stripPrivateMetadata(processableBuffer, actualExt)

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
    // personal metadata is removed.
    originalBytes: originalToStore.length,
  }
}

/**
 * How archive masters are turned into stored versions.
 *
 * Stricter than community uploads, which keep the uploader's own file as the
 * original and only derive the two webp sizes. An archive photo has no stored
 * original, so every size the page shows is a high quality JPEG with no chroma
 * subsampling, and the master's own resolution is kept as the `full` size.
 *
 * Nothing here alters the picture. No sharpening, levels, color correction or
 * cropping: slide mounts, dust and scratches are part of the record. Every
 * size is made once, straight from the master, with Lanczos; `full` is not
 * resized at all.
 *
 * mozjpeg rather than the shared JPEG_OUTPUT, which turns off optimized
 * Huffman coding to save encode time on exports. Here the encode happens once
 * per photo, offline, and the file is served for good. quantisationTable 0 is
 * the standard JPEG table: sharp's mozjpeg preset switches to table 3, on
 * which "quality 91" quantizes like roughly 78 on the standard scale
 * (ImageMagick reads it as 78), so the number would promise more than the
 * file holds. Trellis quantization and optimized progressive scans from the
 * preset are kept.
 *
 * The page serves these as stored. The image optimizer would re-encode them
 * at its own quality and undo this; only the webp thumb goes through it, in
 * grids.
 *
 * Changing any of this changes the bytes, so bump `version`: it is part of
 * the storage key, and objects are cached as immutable.
 */
const archiveJpeg = (quality: number) =>
  ({ quality, mozjpeg: true, quantisationTable: 0, progressive: true, chromaSubsampling: '4:4:4' }) as const

export const ARCHIVE_PROFILE = {
  version: 3,
  /** The master at its own size, for zooming past `largest`. Never resized. */
  full: { jpeg: archiveJpeg(94) },
  largest: { longEdge: 4000, jpeg: archiveJpeg(91) },
  /** The size the photo page shows. */
  medium: { longEdge: MEDIUM.longEdge, jpeg: archiveJpeg(91) },
} as const

/** One stored display version of an archive photo. */
export interface ArchiveVersion {
  url: string
  key: string
  width: number
  height: number
  bytes: number
}

/**
 * Display versions of an archive master, uploaded under `keyPrefix`.
 *
 * Reads the master from a local file and never from storage: the caller
 * downloads it, calls this while it is on disk, and deletes it. The masters
 * this was built for carry no ICC profile and are treated as sRGB, which is
 * also what libvips assumes for an untagged RGB image, so no conversion
 * happens; the profile is embedded so every viewer reads the colors the same
 * way. A master that does carry a profile is converted from it to sRGB.
 */
export async function processArchiveMaster(masterFile: string, keyPrefix: string) {
  const { width, height } = await readArchiveMaster(masterFile)
  const master = () => sharp(masterFile, SHARP_INPUT)

  // fit inside a square of the long edge, never enlarged: a master smaller than
  // the target keeps its own size.
  const resized = (longEdge: number) =>
    master().resize(longEdge, longEdge, { fit: 'inside', withoutEnlargement: true, kernel: 'lanczos3' })

  // One at a time, like processImage: each holds a full decode of the master.
  const largest = await resized(ARCHIVE_PROFILE.largest.longEdge)
    .withIccProfile('srgb')
    .jpeg(ARCHIVE_PROFILE.largest.jpeg)
    .toBuffer({ resolveWithObject: true })
  const medium = await resized(ARCHIVE_PROFILE.medium.longEdge)
    .withIccProfile('srgb')
    .jpeg(ARCHIVE_PROFILE.medium.jpeg)
    .toBuffer({ resolveWithObject: true })
  const thumb = await resized(THUMB.longEdge)
    .withIccProfile('srgb')
    .webp({ quality: THUMB.quality })
    .toBuffer({ resolveWithObject: true })
  const blurHash = await blurHashOf(master())

  const [storedLargest, storedMedium, storedThumb] = await Promise.all([
    storeArchiveVersion(keyPrefix, 'largest', 'jpg', largest),
    storeArchiveVersion(keyPrefix, 'medium', 'jpg', medium),
    storeArchiveVersion(keyPrefix, 'thumb', 'webp', thumb),
  ])

  return {
    masterWidth: width,
    masterHeight: height,
    largest: storedLargest,
    medium: storedMedium,
    thumb: storedThumb,
    blurHash,
  }
}

/**
 * The `full` version of an archive master: its own pixels at its own size,
 * re-encoded as JPEG. Separate from the display versions because it is by
 * far the most expensive to make, so it can be run as its own pass.
 */
export async function processArchiveFull(masterFile: string, keyPrefix: string): Promise<ArchiveVersion> {
  await readArchiveMaster(masterFile)
  const full = await sharp(masterFile, SHARP_INPUT)
    .withIccProfile('srgb')
    .jpeg(ARCHIVE_PROFILE.full.jpeg)
    .toBuffer({ resolveWithObject: true })
  return storeArchiveVersion(keyPrefix, 'full', 'jpg', full)
}

/** The master's size, refusing anything that is not plain RGB. */
async function readArchiveMaster(masterFile: string) {
  const { width = 0, height = 0, space, channels } = await sharp(masterFile, SHARP_INPUT).metadata()
  if (!width || !height) throw new Error('The master has no dimensions')
  if (space !== 'srgb' || channels !== 3) {
    throw new Error(`Expected an RGB master, got ${space} with ${channels} channels`)
  }
  return { width, height }
}

async function storeArchiveVersion(
  keyPrefix: string,
  name: 'full' | 'largest' | 'medium' | 'thumb',
  ext: 'jpg' | 'webp',
  encoded: { data: Buffer; info: { width: number; height: number } }
): Promise<ArchiveVersion> {
  const key = `${keyPrefix}-v${ARCHIVE_PROFILE.version}-${name}.${ext}`
  const url = await uploadToOSS(encoded.data, key)
  return { url, key, width: encoded.info.width, height: encoded.info.height, bytes: encoded.data.length }
}
