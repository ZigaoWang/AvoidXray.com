import piexif from 'piexifjs'

/**
 * Removes what identifies a person from a stored original, and nothing else.
 *
 * The original is publicly downloadable from the photo page. Removing only GPS
 * left camera and lens serial numbers, the owner name a camera writes into
 * every frame, Artist and Copyright (usually a real name, on a site where
 * people go by a handle), the embedded preview (which shows whatever was
 * cropped out), and Lightroom's XMP edit history with local paths such as
 * /Users/<name>/Pictures. The shooting details people come here to compare,
 * camera, scanner, exposure and date, stay.
 *
 * JPEG and PNG are rewritten without re-encoding, so the pixels are the ones
 * that were uploaded. Returns null for any other format, or when the file will
 * not parse, so the caller can fall back to a re-encode, which drops all
 * metadata.
 */

/** Tags that name a person, a device, or a computer. GPS goes as a whole IFD. */
const PERSONAL_TAGS = {
  '0th': ['DocumentName', 'Artist', 'HostComputer', 'Copyright', 'XPTitle', 'XPComment', 'XPAuthor', 'XPKeywords', 'XPSubject', 'CameraSerialNumber', 'RawDataUniqueID'],
  Exif: ['MakerNote', 'UserComment', 'ImageUniqueID', 'CameraOwnerName', 'BodySerialNumber', 'LensSerialNumber'],
} as const

type ExifDict = Record<string, Record<number, unknown> | Buffer | string | null>

const TAG_IDS = {
  '0th': piexif.ImageIFD,
  Exif: piexif.ExifIFD,
} as const

/**
 * The EXIF block with personal tags removed, or the same string when there was
 * nothing to remove. Throws on EXIF it cannot read.
 */
function scrubExif(exifBinary: string): { exif: string; changed: boolean } {
  const data = piexif.load(exifBinary) as ExifDict
  let changed = false
  for (const ifd of ['0th', 'Exif'] as const) {
    const tags = data[ifd] as Record<number, unknown> | undefined
    if (!tags) continue
    for (const name of PERSONAL_TAGS[ifd]) {
      const id = TAG_IDS[ifd][name]
      if (id !== undefined && id in tags) {
        delete tags[id]
        changed = true
      }
    }
  }
  const gps = data.GPS as Record<number, unknown> | undefined
  if (gps && Object.keys(gps).length > 0) {
    data.GPS = {}
    changed = true
  }
  if (data.thumbnail) {
    data.thumbnail = null
    data['1st'] = {}
    changed = true
  }
  return changed ? { exif: piexif.dump(data), changed } : { exif: exifBinary, changed }
}

const EXIF_HEADER = 'Exif\0\0'

/**
 * JPEG: keeps the color-critical segments (JFIF, the ICC profile in APP2,
 * Adobe's APP14) and the scrubbed EXIF, which carries the orientation. Drops
 * XMP, IPTC (APP13), other application segments and comments.
 */
function stripJpeg(buffer: Buffer): Buffer | null {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) return null
  const kept: Buffer[] = [buffer.subarray(0, 2)]
  let changed = false
  let offset = 2
  while (offset + 4 <= buffer.length) {
    if (buffer[offset] !== 0xff) return null
    const marker = buffer[offset + 1]
    // Start of scan: everything after is image data, kept as it is.
    if (marker === 0xda) {
      kept.push(buffer.subarray(offset))
      return changed ? Buffer.concat(kept) : buffer
    }
    const length = buffer.readUInt16BE(offset + 2)
    const end = offset + 2 + length
    if (length < 2 || end > buffer.length) return null
    const segment = buffer.subarray(offset, end)
    const payload = segment.subarray(4)

    if (marker === 0xe1 && payload.subarray(0, 6).toString('latin1') === EXIF_HEADER) {
      const { exif, changed: scrubbed } = scrubExif(payload.toString('latin1'))
      if (scrubbed) {
        const body = Buffer.from(exif, 'latin1')
        if (body.length + 2 > 0xffff) return null
        const header = Buffer.from([0xff, 0xe1, 0, 0])
        header.writeUInt16BE(body.length + 2, 2)
        kept.push(header, body)
        changed = true
      } else {
        kept.push(segment)
      }
    } else if (marker === 0xe1 || marker === 0xed || marker === 0xfe || (marker >= 0xe3 && marker <= 0xed)) {
      // XMP and other APP1, IPTC in APP13, APP3 to APP12, comments.
      changed = true
    } else {
      kept.push(segment)
    }
    offset = end
  }
  return null
}

/** PNG chunks that carry text or EXIF. */
const PNG_METADATA_CHUNKS = new Set(['tEXt', 'zTXt', 'iTXt', 'eXIf', 'tIME'])
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

/** PNG: drops text and EXIF chunks. Pixels and color chunks are untouched. */
function stripPng(buffer: Buffer): Buffer | null {
  if (buffer.length < 8 || !buffer.subarray(0, 8).equals(PNG_SIGNATURE)) return null
  const kept: Buffer[] = [PNG_SIGNATURE]
  let changed = false
  let offset = 8
  while (offset + 12 <= buffer.length) {
    const length = buffer.readUInt32BE(offset)
    const type = buffer.subarray(offset + 4, offset + 8).toString('latin1')
    const end = offset + 12 + length
    if (end > buffer.length) return null
    if (PNG_METADATA_CHUNKS.has(type)) changed = true
    else kept.push(buffer.subarray(offset, end))
    offset = end
    if (type === 'IEND') return changed ? Buffer.concat(kept) : buffer
  }
  return null
}

/**
 * The file with personal metadata removed, the same buffer when it had none,
 * or null when the format is not JPEG or PNG or the file does not parse.
 */
export function stripPersonalMetadata(buffer: Buffer): Buffer | null {
  try {
    return stripJpeg(buffer) ?? stripPng(buffer)
  } catch {
    return null
  }
}
