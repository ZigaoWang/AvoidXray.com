/// <reference lib="webworker" />
/**
 * Opens a zip in the background and hands back each image in it as its own
 * file, so a whole delivery can be dropped as one zip and still upload scan by
 * scan. Read as a stream: a delivery of several gigabytes never has to sit in
 * memory at once, only the file being unpacked.
 *
 * In: { zip: File }. Out, in order: { type: 'file', path, blob } for each
 * entry, then { type: 'done' }, or { type: 'error', message }.
 */
import { Unzip, UnzipInflate, UnzipPassThrough } from 'fflate'

declare const self: DedicatedWorkerGlobalScope

self.onmessage = async (event: MessageEvent<{ zip: File }>) => {
  try {
    await unzip(event.data.zip)
    self.postMessage({ type: 'done' })
  } catch (error) {
    self.postMessage({ type: 'error', message: error instanceof Error ? error.message : String(error) })
  }
}

async function unzip(zip: File) {
  const pending: Promise<void>[] = []
  const unzipper = new Unzip(entry => {
    if (entry.name.endsWith('/')) return
    const chunks: Uint8Array[] = []
    pending.push(new Promise<void>((resolve, reject) => {
      entry.ondata = (error, chunk, final) => {
        if (error) { reject(error); return }
        chunks.push(chunk)
        if (final) {
          self.postMessage({ type: 'file', path: entry.name, blob: new Blob(chunks as BlobPart[]) })
          resolve()
        }
      }
    }))
    entry.start()
  })
  unzipper.register(UnzipInflate)
  unzipper.register(UnzipPassThrough)

  const reader = zip.stream().getReader()
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    unzipper.push(value)
  }
  unzipper.push(new Uint8Array(0), true)
  await Promise.all(pending)
}
