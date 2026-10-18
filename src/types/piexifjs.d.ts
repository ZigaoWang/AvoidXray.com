/**
 * piexifjs ships no types. Only the corner used is declared: scrubbing personal
 * tags from stored originals (src/lib/stripMetadata.ts) and building EXIF
 * fixtures in scripts/test/exifStrip.test.ts.
 */
declare module 'piexifjs' {
  const piexif: {
    ImageIFD: Record<string, number>
    ExifIFD: Record<string, number>
    GPSIFD: Record<string, number>
    load(exif: string): Record<string, unknown>
    dump(exif: Record<string, unknown>): string
    insert(exif: string, dataUrl: string): string
    remove(dataUrl: string): string
  }
  export default piexif
}
