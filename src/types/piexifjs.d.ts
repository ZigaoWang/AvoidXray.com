/**
 * piexifjs ships no types. Only the corner used to build EXIF fixtures in
 * scripts/test/exifStrip.test.ts is declared, rather than pulling in a
 * dependency for the rest.
 */
declare module 'piexifjs' {
  const piexif: {
    ImageIFD: Record<string, number>
    GPSIFD: Record<string, number>
    dump(exif: Record<string, unknown>): string
    insert(exif: string, dataUrl: string): string
    remove(dataUrl: string): string
  }
  export default piexif
}
