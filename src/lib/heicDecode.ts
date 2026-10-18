import { Worker } from 'node:worker_threads'
import { MAX_HEIC_PIXELS } from './sharpConfig'

/**
 * HEIC/HEIF decoding off the main thread.
 *
 * libheif runs as WebAssembly and decodes synchronously, so on the main thread
 * a 48MP iPhone photo held the event loop for the whole decode: every page and
 * API request on this single-process server waited behind one upload. Here it
 * runs in one long-lived worker thread, one file at a time, which also bounds
 * the memory to a single decoded frame however many uploads arrive together.
 *
 * The result is raw RGBA, handed over without a copy, for
 * `sharp(data, { raw: { width, height, channels: 4 } })`. It used to be encoded
 * to PNG first only for sharp to decode it again.
 *
 * Server only.
 */

export type DecodedHeic = { data: Buffer; width: number; height: number }

/**
 * A decode still going after this long is stuck rather than slow: the largest
 * file the ceiling admits decodes in a few seconds. The worker is terminated,
 * which is the only way to stop WebAssembly mid-run, and the next call starts
 * a fresh one.
 */
const DECODE_TIMEOUT_MS = 60_000

/**
 * The worker's code, inline rather than a file beside this one.
 *
 * A separate file would have to survive the bundler: Turbopack rewrites module
 * paths, and a worker script it did not trace is missing from the build. An
 * inline script loads heic-decode with Node's own require at run time, from
 * the app's node_modules (resolved from the working directory, which pm2 sets
 * to the checkout), the same copy the main thread would have used.
 *
 * The pixel ceiling is checked inside, from the container's header, before the
 * frame is decoded: libheif allocates width * height * 4 bytes for whatever
 * dimensions a file declares, so a crafted file must be refused before that.
 */
const WORKER_SOURCE = `
const { parentPort } = require('node:worker_threads')
const heicDecode = require('heic-decode')

parentPort.on('message', async ({ id, buffer, maxPixels }) => {
  let images
  try {
    images = await heicDecode.all({ buffer: Buffer.from(buffer) })
    if (images.length === 0) throw new Error('HEIF image not found')
    const { width, height } = images[0]
    if (width * height > maxPixels) {
      throw new Error('Input image exceeds pixel limit: ' + width + 'x' + height)
    }
    const { data } = await images[0].decode()
    const pixels = data.byteOffset === 0 && data.byteLength === data.buffer.byteLength
      ? data.buffer
      : data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)
    parentPort.postMessage({ id, width, height, pixels }, [pixels])
  } catch (error) {
    parentPort.postMessage({ id, error: error instanceof Error ? error.message : String(error) })
  } finally {
    if (images) images.dispose()
  }
})
`

type Job = {
  id: number
  input: ArrayBuffer
  resolve: (decoded: DecodedHeic) => void
  reject: (error: Error) => void
  /** The thread decoding it, so a dying thread fails only its own job. */
  on?: Worker
}

let worker: Worker | null = null
let current: Job | null = null
let timer: ReturnType<typeof setTimeout> | undefined
const queue: Job[] = []
let nextId = 0

function settle() {
  clearTimeout(timer)
  const job = current!
  current = null
  // Idle, the thread should not keep a script alive or hold up a shutdown.
  job.on?.unref()
  return job
}

/** Fails the job in progress if `thread` is the one running it. */
function failOn(thread: Worker, error: Error) {
  if (worker === thread) worker = null
  if (current?.on === thread) settle().reject(error)
  pump()
}

function spawn(): Worker {
  const created = new Worker(WORKER_SOURCE, { eval: true })
  created.on('message', (message: { id: number; error?: string; width?: number; height?: number; pixels?: ArrayBuffer }) => {
    if (!current || message.id !== current.id) return
    const job = settle()
    if (message.error !== undefined) job.reject(new Error(message.error))
    else job.resolve({ data: Buffer.from(message.pixels!), width: message.width!, height: message.height! })
    pump()
  })
  created.on('error', error => failOn(created, error))
  created.on('exit', code => failOn(created, new Error(`HEIC decoder exited with code ${code}`)))
  return created
}

function pump() {
  if (current || queue.length === 0) return
  const job = queue.shift()!
  if (!worker) worker = spawn()
  const running = worker
  job.on = running
  current = job
  // Held open while it works, so a script awaiting a decode is not cut off.
  running.ref()
  timer = setTimeout(() => {
    failOn(running, new Error('HEIC decode timed out'))
    void running.terminate()
  }, DECODE_TIMEOUT_MS)
  running.postMessage({ id: job.id, buffer: job.input, maxPixels: MAX_HEIC_PIXELS }, [job.input])
}

/**
 * Decodes the first frame of a HEIC/HEIF file to RGBA.
 *
 * Rejects with sharp's own wording for an image over MAX_HEIC_PIXELS, so
 * `isTooLarge` in sharpConfig.ts recognizes it like any other oversized image.
 * The input buffer is copied once to hand to the worker; the caller's is left
 * untouched.
 */
export function decodeHeic(buffer: Buffer): Promise<DecodedHeic> {
  return new Promise((resolve, reject) => {
    const input = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer
    queue.push({ id: nextId++, input, resolve, reject })
    pump()
  })
}
