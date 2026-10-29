/// <reference lib="webworker" />
/**
 * Hashes a file in the background before it is uploaded: the whole file, by
 * which an exact copy is found, and its image data, by which the same scan
 * with different metadata is. Also reads the scanner or camera model the file
 * names, to suggest for its roll. Never the file's dates: a scan's date is when
 * it was scanned, not when it was shot.
 *
 * In: { id, file }. Out: { id, sha256, imageSha256, scannerModel } or
 * { id, error }. One file at a time, so a folder of large TIFFs is read one
 * by one rather than all at once.
 */
import exifr from 'exifr'
import { imageDataSha256, sha256Hex } from '../../imageHash'

declare const self: DedicatedWorkerGlobalScope

let queue = Promise.resolve()

self.onmessage = (event: MessageEvent<{ id: string; file: Blob }>) => {
  const { id, file } = event.data
  queue = queue.then(async () => {
    try {
      const bytes = new Uint8Array(await file.arrayBuffer())
      const [sha256, imageSha256, scannerModel] = await Promise.all([
        sha256Hex(bytes),
        imageDataSha256(bytes),
        modelOf(bytes),
      ])
      self.postMessage({ id, sha256, imageSha256, scannerModel })
    } catch (error) {
      self.postMessage({ id, error: error instanceof Error ? error.message : String(error) })
    }
  })
}

async function modelOf(bytes: Uint8Array): Promise<string | null> {
  try {
    const tags = await exifr.parse(bytes, { pick: ['Model'] })
    const model = typeof tags?.Model === 'string' ? tags.Model.trim() : ''
    return model || null
  } catch {
    return null
  }
}
