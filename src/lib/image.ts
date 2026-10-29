import sharp, { type Sharp } from 'sharp'
import { encode } from 'blurhash'
import { uploadToOSS } from './oss'
import { decodeHeic } from './heicDecode'
import exifr from 'exifr'
import { imageDataSha256, sha256Hex } from './imageHash'
import { newPhotoKey, storedKeys, storedPaths } from './photoStorage'
import { SHARP_INPUT, isTooLarge } from './sharpConfig'

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

/**
 * The 4000px version the lightbox and every full-size view use, made with the
 * archive's JPEG settings (see ARCHIVE_PROFILE). Never enlarged: a smaller
 * original keeps its own size.
 */
const LARGE = { longEdge: 4000 } as const

/** Display versions of one photo, encoded but not yet stored. */
export interface Derivatives {
  thumb: Buffer
  medium: Buffer
  large: Buffer
  /** The picture's size the right way up, as every version is. */
  width: number
  height: number
  blurHash: string
  /** See differenceHash. */
  perceptualHash: string
}

/**
 * Every display version of an image, each made straight from the source.
 *
 * Each one decodes the source again rather than resizing a shared
 * intermediate: an intermediate is an extra lossy encode, and was. The EXIF
 * orientation is applied in the same pipeline. Nothing of the source's
 * metadata is carried over except its colors: a tagged source is converted
 * to sRGB and every version carries the sRGB profile, so every browser reads
 * the colors the same way. Untagged sources are taken as sRGB, which is what
 * they almost always are and what libvips assumes.
 *
 * One at a time, as before: each holds a decode of the source.
 */
export async function makeDerivatives(source: Buffer): Promise<Derivatives> {
  const meta = await sharp(source, SHARP_INPUT).metadata()
  const width = meta.autoOrient?.width ?? meta.width ?? 0
  const height = meta.autoOrient?.height ?? meta.height ?? 0
  if (!width || !height) throw new Error('The image has no dimensions')

  const resized = (longEdge: number) =>
    sharp(source, SHARP_INPUT)
      .autoOrient()
      .resize(longEdge, longEdge, { fit: 'inside', withoutEnlargement: true, kernel: 'lanczos3' })
      .withIccProfile('srgb')

  const thumb = await resized(THUMB.longEdge).webp({ quality: THUMB.quality }).toBuffer()
  const medium = await resized(MEDIUM.longEdge).webp({ quality: MEDIUM.quality }).toBuffer()
  const large = await resized(LARGE.longEdge).jpeg(ARCHIVE_PROFILE.largest.jpeg).toBuffer()

  // From the thumbnail, which is already small and the right way up.
  return {
    thumb, medium, large, width, height,
    blurHash: await blurHashOf(sharp(thumb)),
    perceptualHash: await differenceHash(thumb),
  }
}

/**
 * A 64-bit difference hash: the picture shrunk to 9x8 gray pixels, one bit
 * per pair of neighbors saying which is brighter. Close hashes mean similar
 * pictures, whatever their size or encoding. As 16 hex digits.
 */
export async function differenceHash(image: Buffer): Promise<string> {
  const pixels = await sharp(image).greyscale().resize(9, 8, { fit: 'fill', kernel: 'lanczos3' }).raw().toBuffer()
  const [zero, one] = [BigInt(0), BigInt(1)]
  let hash = zero
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      hash = (hash << one) | (pixels[row * 9 + col] > pixels[row * 9 + col + 1] ? one : zero)
    }
  }
  return hash.toString(16).padStart(16, '0')
}

/** How a stored original is named and described. */
export interface OriginalFile {
  /** sharp's name for the container, or `heif`. */
  format: string
  ext: string
  /** What the display versions are made from: the file itself, or a HEIC decoded losslessly. */
  source: Buffer
}

/**
 * Reads what an uploaded file is, refusing anything that is not a photograph
 * in a format we store.
 *
 * The extension comes from the bytes, never the uploaded name, which could
 * otherwise put `originals/<key>.html` in the bucket. HEIC is kept as it was
 * sent; its display versions come from a lossless decode.
 */
export async function identifyOriginal(buffer: Buffer): Promise<OriginalFile> {
  if (isHeicBuffer(buffer)) {
    const { buffer: source } = await convertHeicIfNeeded(buffer, 'heic')
    return { format: 'heif', ext: 'heic', source }
  }
  const { format } = await sharp(buffer, SHARP_INPUT).metadata()
  const ext = format ? STORED_EXTENSIONS[format] : undefined
  if (!format || !ext) throw new Error(`unsupported image format: ${format ?? 'unknown'}`)
  return { format, ext, source: buffer }
}

/**
 * The device the file's metadata says made it, as written there. For a lab
 * scan that is the scanner. Null when the file names none or cannot be read.
 */
export async function scannerModelOf(buffer: Buffer): Promise<string | null> {
  try {
    const tags = await exifr.parse(buffer, { pick: ['Model'] })
    const model = typeof tags?.Model === 'string' ? tags.Model.trim() : ''
    return model || null
  } catch {
    return null
  }
}

/**
 * Stores a new community upload: the original exactly as it arrived, always
 * private, and its display versions, public or private as asked.
 *
 * `original` is what identifyOriginal said of `buffer`. Keys are random. The
 * caller writes the row and, if that fails, deletes `keys`; nothing here can
 * know whether it will.
 */
export async function processImage(
  buffer: Buffer,
  original: OriginalFile,
  photoId: string,
  options: { imagesPublic: boolean }
) {
  const derivatives = await makeDerivatives(original.source)
  const [originalSha256, imageSha256, scannerModel] = await Promise.all([
    sha256Hex(buffer), imageDataSha256(buffer), scannerModelOf(buffer),
  ])

  const keys = {
    id: photoId,
    originalKey: newPhotoKey('original', original.ext),
    thumbKey: newPhotoKey('thumb', 'webp'),
    mediumKey: newPhotoKey('medium', 'webp'),
    largeKey: newPhotoKey('large', 'jpg'),
  }
  const access = options.imagesPublic ? 'public' : 'private'
  const paths = storedPaths(keys, options.imagesPublic)
  await Promise.all([
    uploadToOSS(buffer, keys.originalKey, 'private'),
    uploadToOSS(derivatives.thumb, keys.thumbKey, access),
    uploadToOSS(derivatives.medium, keys.mediumKey, access),
    uploadToOSS(derivatives.large, keys.largeKey, access),
  ])

  return {
    keys: storedKeys(keys),
    data: {
      originalKey: keys.originalKey,
      thumbKey: keys.thumbKey,
      mediumKey: keys.mediumKey,
      largeKey: keys.largeKey,
      imagesPublic: options.imagesPublic,
      ...paths,
      originalPath: paths.originalPath!,
      width: derivatives.width,
      height: derivatives.height,
      blurHash: derivatives.blurHash,
      perceptualHash: derivatives.perceptualHash,
      originalBytes: buffer.length,
      derivativeBytes: derivatives.thumb.length + derivatives.medium.length + derivatives.large.length,
      format: original.format,
      originalSha256,
      imageSha256,
      scannerModel,
    },
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
