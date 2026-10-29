/**
 * Hashes for recognizing a file that is already in someone's library.
 *
 * Written against Web Crypto and plain byte arrays only, so the upload page's
 * worker computes exactly what the server stores: both sides run this file.
 *
 * Two exact hashes, because the bytes a library holds are not always the bytes
 * its owner has on disk. Photos uploaded before originals were kept exactly as
 * sent had personal metadata removed by rewriting their EXIF, which changes
 * the file but not one byte of the picture. So:
 *
 * - `sha256Hex` of the whole file says "this exact file".
 * - `imageDataSha256` covers the picture's own encoded data and nothing
 *   before it: a JPEG from its first start-of-scan marker to the end of the
 *   file, a PNG's IDAT chunk contents in order. Rewriting or removing metadata
 *   leaves it unchanged; any change to the picture does not. Undefined for
 *   other formats, where it returns null rather than a hash of something else
 *   under the same name.
 */

const hex = (digest: ArrayBuffer) =>
  Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('')

async function sha256(bytes: Uint8Array): Promise<string> {
  return hex(await crypto.subtle.digest('SHA-256', bytes as Uint8Array<ArrayBuffer>))
}

export function sha256Hex(bytes: Uint8Array): Promise<string> {
  return sha256(bytes)
}

/**
 * Where a JPEG's first scan starts, or null if the file is not a JPEG whose
 * header segments can be walked to one.
 */
export function jpegScanOffset(bytes: Uint8Array): number | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null
  let offset = 2
  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) return null
    const marker = bytes[offset + 1]
    // Fill bytes: a marker may be preceded by any number of 0xFF.
    if (marker === 0xff) { offset++; continue }
    if (marker === 0xda) return offset
    // Markers that stand alone, with no length.
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { offset += 2; continue }
    const length = (bytes[offset + 2] << 8) | bytes[offset + 3]
    if (length < 2) return null
    offset += 2 + length
  }
  return null
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

/** A PNG's IDAT contents joined in order, or null if it is not a readable PNG. */
export function pngImageData(bytes: Uint8Array): Uint8Array | null {
  if (bytes.length < 8 || PNG_SIGNATURE.some((b, i) => bytes[i] !== b)) return null
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const parts: Uint8Array[] = []
  let total = 0
  let offset = 8
  while (offset + 12 <= bytes.length) {
    const length = view.getUint32(offset)
    const end = offset + 12 + length
    if (end > bytes.length) return null
    const type = String.fromCharCode(bytes[offset + 4], bytes[offset + 5], bytes[offset + 6], bytes[offset + 7])
    if (type === 'IDAT') {
      parts.push(bytes.subarray(offset + 8, offset + 8 + length))
      total += length
    }
    if (type === 'IEND') {
      if (parts.length === 0) return null
      const joined = new Uint8Array(total)
      let at = 0
      for (const part of parts) { joined.set(part, at); at += part.length }
      return joined
    }
    offset = end
  }
  return null
}

/** See the top of this file. Null for anything but a readable JPEG or PNG. */
export async function imageDataSha256(bytes: Uint8Array): Promise<string | null> {
  const scan = jpegScanOffset(bytes)
  if (scan !== null) return sha256(bytes.subarray(scan))
  const idat = pngImageData(bytes)
  if (idat !== null) return sha256(idat)
  return null
}

/** Bits that differ between two perceptual hashes, each 16 hex digits. */
export function hammingDistance(a: string, b: string): number {
  let x = BigInt(`0x${a}`) ^ BigInt(`0x${b}`)
  let count = 0
  const [zero, one] = [BigInt(0), BigInt(1)]
  while (x !== zero) { x &= x - one; count++ }
  return count
}
