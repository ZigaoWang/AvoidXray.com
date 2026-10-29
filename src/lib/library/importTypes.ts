/**
 * What an import takes, shared by the import page and the server. No imports:
 * the page bundles this.
 */

/** The largest file an import takes. Above any scan a lab sends. */
export const MAX_IMPORT_FILE_BYTES = 1024 * 1024 * 1024

/**
 * Extensions the import page sends, and the extension the original is stored
 * under. The bytes decide what a file really is; this only keeps an obviously
 * wrong file from being uploaded at all, and gives the stored object a type.
 */
export const IMPORT_EXTENSIONS: Record<string, string> = {
  jpg: 'jpg', jpeg: 'jpg', png: 'png', tif: 'tif', tiff: 'tif', heic: 'heic', heif: 'heic', webp: 'webp',
}

/** Said of a file the import does not take. */
export const NOT_AN_IMPORT_TYPE = 'Not a JPEG, PNG, TIFF, HEIC or WebP file'

export function importExtensionOf(filename: string): string | null {
  const dot = filename.lastIndexOf('.')
  return dot < 0 ? null : IMPORT_EXTENSIONS[filename.slice(dot + 1).toLowerCase()] ?? null
}
