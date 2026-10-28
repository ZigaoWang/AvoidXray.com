/**
 * Checks on a downloaded archive master, before anything is made from it.
 *
 * Pure, so the importer and its tests share them. A challenge page from a CDN
 * arrives as an ordinary response, and a body saved without looking would be
 * hashed and recorded as the master, so the response must say it is a TIFF
 * and be exactly as long as the HEAD request promised. That the file then
 * decodes as an image is checked by the importer, which has sharp.
 */

/** Why a response cannot be a master TIFF, from its content type; null when it can. */
export function masterContentTypeProblem(contentType: string | null): string | null {
  const type = (contentType ?? '').split(';')[0].trim().toLowerCase()
  return type === 'image/tiff' ? null : `not a TIFF: content type ${type || 'missing'}`
}

/** Why a downloaded master's length is wrong, against the HEAD content-length; null when it matches. */
export function masterSizeProblem(bytes: number, headBytes: number): string | null {
  return bytes === headBytes ? null : `downloaded ${bytes} bytes, HEAD reported ${headBytes}`
}
