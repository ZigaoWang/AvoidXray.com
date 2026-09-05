declare module 'heic-decode' {
  interface DecodedImage {
    width: number
    height: number
    /** RGBA, four bytes per pixel. */
    data: Uint8ClampedArray
  }

  /**
   * One frame's dimensions, without its pixels.
   *
   * This is the reason the library is used directly rather than through
   * heic-convert: the size is known from the container before anything
   * allocates `width * height * 4` bytes, which is the only point at which an
   * oversized file can still be refused cheaply.
   */
  interface LazyImage {
    width: number
    height: number
    decode(): Promise<DecodedImage>
  }

  type LazyImages = LazyImage[] & { dispose(): void }

  function decode(input: { buffer: Buffer }): Promise<DecodedImage>
  namespace decode {
    function all(input: { buffer: Buffer }): Promise<LazyImages>
  }

  export default decode
}
