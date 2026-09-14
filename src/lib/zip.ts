/**
 * A ZIP file, stored rather than compressed.
 *
 * Every export this packages is a JPEG, which is already compressed — deflating
 * one costs time and memory to save a percent or two, so these are stored. That
 * removes the only part of the format worth pulling a dependency in for, and
 * what is left is three record layouts and a checksum.
 *
 * Written here rather than installed because it runs in the browser on a
 * selection somebody made: the bytes are already in the tab, and shipping a
 * compressor to avoid writing sixty lines would be the wrong trade for a
 * one-person project. The suite checks the output with the system's own unzip,
 * because a format nobody can open is worse than no feature.
 */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let i = 0; i < 256; i++) {
    let c = i
    for (let bit = 0; bit < 8; bit++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[i] = c >>> 0
  }
  return table
})()

export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

export interface ZipEntry {
  /** The path inside the archive. Anything a file system would refuse is replaced. */
  name: string
  /**
   * The file itself, as bytes or as the blob a download already produced.
   *
   * Prefer the blob. A batch export is thirty-six full-resolution JPEGs, and
   * held as arrays that is most of what a phone gives a tab — enough to have
   * the tab killed at the last frame, losing all thirty-five before it. A blob
   * lives in the browser's own store rather than the heap, so passing them
   * through keeps exactly one file's bytes live at a time: the one being
   * checksummed.
   */
  bytes: Uint8Array | Blob
}

/**
 * MS-DOS date and time, which is what the format still carries.
 *
 * Seconds have one bit less than they need, so they step in twos, and the year
 * counts from 1980. Out of range dates are clamped rather than wrapped: a
 * negative year writes a field that some readers reject outright.
 */
function dosStamp(when: Date): { time: number; date: number } {
  const year = Math.min(2107, Math.max(1980, when.getFullYear()))
  return {
    time: (when.getHours() << 11) | (when.getMinutes() << 5) | (when.getSeconds() >> 1),
    date: ((year - 1980) << 9) | ((when.getMonth() + 1) << 5) | when.getDate(),
  }
}

/**
 * A name every reader will take, which means ASCII.
 *
 * Slashes would make directories and a leading dot makes a file that is awkward
 * to open, so those go. So does anything outside ASCII, and that is not
 * squeamishness: the format has carried a flag since 2007 saying the name is
 * UTF-8, this writer sets it, and the unzip shipped with macOS ignores it.
 * Measured here — a member called "cafe" with an accent extracts under a
 * mangled name and is then reported as truncated. The archive is valid and
 * anything built this decade opens it correctly; the tool already on the
 * machine does not, which makes that flag the wrong thing to rely on.
 *
 * Nothing is lost in practice, because the caller slugifies film and camera
 * names to a-z0-9 long before they reach here. The guarantee belongs where the
 * bytes are written rather than in a note about how the caller behaves.
 */
export function safeName(name: string): string {
  const cleaned = name
    .replace(/[^\x20-\x7e]+/g, '-')
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[.-]+/, '')
    .trim()
  return cleaned || 'photo.jpg'
}

/** Little endian writes, which is the only byte order the format uses. */
function u16(view: DataView, at: number, value: number) { view.setUint16(at, value, true) }
function u32(view: DataView, at: number, value: number) { view.setUint32(at, value, true) }

/**
 * The archive, as one blob.
 *
 * Assembled whole rather than streamed: this is a set of photographs picked by
 * hand, each one already downloaded, and a stream would buy nothing but a
 * second code path.
 *
 * Async because of the checksum. The format puts it in a header that precedes
 * the file, so it has to be computed before anything is written, and computing
 * it over a blob means reading that blob back out. Done one at a time and in
 * order, so what is resident is one file rather than the archive.
 */
export async function makeZip(entries: ZipEntry[], when: Date = new Date()): Promise<Blob> {
  const encoder = new TextEncoder()
  const { time, date } = dosStamp(when)

  const prepared: { name: Uint8Array; bytes: Uint8Array | Blob; size: number; crc: number }[] = []
  for (const entry of entries) {
    // Read, checksummed, and let go of before the next one is touched. The
    // array is deliberately not kept: `bytes` stays the blob, so the archive
    // below is assembled out of the browser's store rather than the heap.
    const bytes = entry.bytes instanceof Blob
      ? new Uint8Array(await entry.bytes.arrayBuffer())
      : entry.bytes
    prepared.push({
      name: encoder.encode(safeName(entry.name)),
      bytes: entry.bytes,
      size: bytes.length,
      crc: crc32(bytes),
    })
  }

  const parts: (Uint8Array | Blob)[] = []
  const offsets: number[] = []
  let at = 0

  for (const file of prepared) {
    offsets.push(at)
    const header = new Uint8Array(30 + file.name.length)
    const view = new DataView(header.buffer)
    u32(view, 0, 0x04034b50)          // local file header
    u16(view, 4, 20)                  // version needed: 2.0
    u16(view, 6, 0x0800)              // UTF-8 names
    u16(view, 8, 0)                   // stored
    u16(view, 10, time)
    u16(view, 12, date)
    u32(view, 14, file.crc)
    u32(view, 18, file.size)  // compressed size
    u32(view, 22, file.size)  // uncompressed size
    u16(view, 26, file.name.length)
    u16(view, 28, 0)                  // no extra field
    header.set(file.name, 30)
    parts.push(header, file.bytes)
    at += header.length + file.size
  }

  const directoryAt = at
  for (let i = 0; i < prepared.length; i++) {
    const file = prepared[i]
    const entry = new Uint8Array(46 + file.name.length)
    const view = new DataView(entry.buffer)
    u32(view, 0, 0x02014b50)          // central directory header
    u16(view, 4, 20)                  // version made by
    u16(view, 6, 20)                  // version needed
    u16(view, 8, 0x0800)
    u16(view, 10, 0)                  // stored
    u16(view, 12, time)
    u16(view, 14, date)
    u32(view, 16, file.crc)
    u32(view, 20, file.size)
    u32(view, 24, file.size)
    u16(view, 28, file.name.length)
    u16(view, 30, 0)                  // extra
    u16(view, 32, 0)                  // comment
    u16(view, 34, 0)                  // disk
    u16(view, 36, 0)                  // internal attributes
    u32(view, 38, 0)                  // external attributes
    u32(view, 42, offsets[i])
    entry.set(file.name, 46)
    parts.push(entry)
    at += entry.length
  }

  const end = new Uint8Array(22)
  const view = new DataView(end.buffer)
  u32(view, 0, 0x06054b50)            // end of central directory
  u16(view, 4, 0)                     // this disk
  u16(view, 6, 0)                     // disk with the directory
  u16(view, 8, prepared.length)
  u16(view, 10, prepared.length)
  u32(view, 12, at - directoryAt)     // directory size
  u32(view, 16, directoryAt)
  u16(view, 20, 0)                    // comment length
  parts.push(end)

  // Cast because a Uint8Array's buffer is ArrayBufferLike rather than the
  // ArrayBuffer that BlobPart names. Every one of these is heap allocated here.
  return new Blob(parts as BlobPart[], { type: 'application/zip' })
}
