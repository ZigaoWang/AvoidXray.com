/**
 * The vision worker: what each photo shows, and whether it can go public.
 *
 * A separate process from the site, run by pm2 next to it. The two models hold
 * about 2GB between them, loaded once at startup. Inside the web process that
 * memory would sit on top of export renders, and a crash in either would take
 * the other down. Here the site keeps working when the worker is down; uploads
 * wait in the queue and catch up when it comes back.
 *
 * The queue is the Photo table itself:
 *
 * - `screening = PENDING` rows are new uploads. Each gets a nudity score and an
 *   embedding, then becomes CLEAR, or HELD for an admin if the score is at or
 *   above the classifier's own decision boundary. Oldest first, ahead of
 *   everything else, because nobody else can see these photos until then.
 * - Rows with no embedding from the current model are the backfill. The same
 *   rule finds every photo again when the model changes.
 *
 * Search and "More like this" are answered over HTTP on loopback only. The
 * vectors are held in memory, about 4KB a photo, so a query is one text
 * encoding plus a dot product per photo. Only photos a stranger can see are
 * held (see `syncIndex`); the site still applies blocks and its own visibility
 * check to what comes back, because the index can trail a change by up to
 * five minutes.
 *
 *   npx tsx vision/worker.ts
 */
import { createHash } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import http from 'node:http'
import path from 'node:path'
import * as ort from 'onnxruntime-node'
import sharp, { type Sharp } from 'sharp'
import { PrismaClient, Prisma } from '@prisma/client'
import {
  AutoProcessor,
  AutoTokenizer,
  RawImage,
  SiglipTextModel,
  SiglipVisionModel,
  env,
  type PreTrainedTokenizer,
  type Processor,
} from '@huggingface/transformers'

try {
  process.loadEnvFile(path.join(process.cwd(), '.env'))
} catch {
  // Already in the environment, as under pm2 with env set, or in CI.
}

/**
 * Google's SigLIP 2, large, int8. Chosen by testing three sizes against every
 * public photo: base mistook a motorcycle for a bicycle and a lake for a
 * camera; the 400M model was five times slower than this one for no visible
 * gain. It reads Chinese as well as English. Apache-2.0.
 */
const EMBEDDING_REPO = 'onnx-community/siglip2-large-patch16-256-ONNX'
/** Stored on every row. Changing the model or its precision changes this. */
const EMBEDDING_MODEL = 'siglip2-large-patch16-256/q8'

/**
 * Freepik's nudity classifier (EVA-02, MIT), int8, in a community ONNX export
 * pinned to one revision and checked by hash. It grades a photo as neutral,
 * suggestive, partial nudity or explicit.
 *
 * Two others were tried on every public photo on the site. AdamCodd's scored
 * ordinary photos of clothed people at 0.98. Falconsai's scored everything
 * under 0.01 but passed the Venus de Milo at 0.000: it knows explicit images,
 * not nudity. This one scored no site photo at 0.5 or above (the highest was
 * 0.34) and the Venus de Milo at 0.73.
 */
const NUDITY_URL =
  'https://huggingface.co/sitatech/freepik_nsfw_detector_onnx/resolve/250a86051c7302bc6943ea35b9d778765ca13452/onnx/model_quantized.onnx'
const NUDITY_SHA256 = 'b0063a2e02ca65d11b09914841df4354a8140d80265a583e09e61ea2c826d29d'
/** Stored on every scored photo. A photo scored by another model is scored again. */
const NUDITY_MODEL = 'freepik-nsfw-eva02-448/q8'
/**
 * In place of a model name on a photo held because it could not be scored.
 * Still not the current model, so a later run scores it; but if an admin has
 * approved it by then, the score is only recorded (see processPhoto).
 */
const UNCHECKED = 'unchecked'
const NUDITY_SIZE = 448
const NUDITY_MEAN = [0.48145466, 0.4578275, 0.40821073]
const NUDITY_STD = [0.26862954, 0.26130258, 0.27577711]
/**
 * Held when partial nudity and explicit together pass even odds against
 * neutral and suggestive. A hold is only a review, never a removal.
 */
const HOLD_AT = 0.5

/**
 * The lowest margin a photo needs to count as a match (see `margin`).
 *
 * Measured on all of the site's photos: subjects in none of them (giraffe,
 * kangaroo, elephant) top out between 0.020 and 0.027, and most real matches
 * score above 0.03. At 0.02 a bus deck came back for "giraffe"; at 0.03 half
 * the real results for "girl" were lost. A query with nothing above it returns
 * nothing, which is the answer people should get.
 */
const MIN_MARGIN = 0.025

/** How far a query's best matches must stand above its typical photo (see /search). */
const MIN_SPREAD = 0.032

/**
 * Phrasings averaged into one query vector. A single phrasing makes results
 * swing on wording; the average is steadier. "film photo" because these are.
 */
const TEMPLATES = ['a photo of {}.', 'a film photo of {}.', 'a picture of {}.']

/**
 * Prompts that describe nothing in particular. How well a photo matches these
 * is how well it matches anything, and subtracting it is what stops photos
 * that score high for every query from topping every search.
 */
const NEUTRAL = ['something', 'a photo', 'an image', 'a scene']

const PORT = Number(process.env.VISION_PORT || 3210)
/** The copy an upload sends to /screen is around 100KB; this is far above it. */
const SCREEN_MAX_BYTES = 8 * 1024 * 1024
/** CPU threads per model run. Kept below the core count so the site stays responsive during a backfill. */
const THREADS = Number(process.env.VISION_THREADS || 2)
/**
 * libvips follows the same budget. Without this it took one thread per core
 * for every resize, so the nudity check and each thumbnail decode ran across
 * the whole machine while the models were held to a third of it.
 */
sharp.concurrency(THREADS)
/**
 * A thumbnail is around 100KB. A download still going after this long is
 * stalled, and the batch behind it is serial: one hung socket kept every new
 * upload waiting for as long as the connection stayed open.
 */
const DOWNLOAD_TIMEOUT_MS = 30_000
const IDLE_POLL_MS = 2000
const BATCH = 8
/** Attempts before a photo that keeps failing is left alone until the next restart. */
const MAX_ATTEMPTS = 3

env.cacheDir = process.env.VISION_MODEL_DIR || path.join(process.cwd(), '.vision-models')

const prisma = new PrismaClient()
const log = (...args: unknown[]) => console.log('[vision]', ...args)

let tokenizer: PreTrainedTokenizer
let processor: Processor
let textModel: SiglipTextModel
let visionModel: SiglipVisionModel
let nudity: ort.InferenceSession

/** Unit vectors by photo id, and each photo's similarity to the neutral prompts. */
const vectors = new Map<string, Float32Array>()
const baselines = new Map<string, number>()
let neutral: Float32Array

const failures = new Map<string, number>()
let ready = false

function normalize(v: Float32Array): Float32Array {
  let sum = 0
  for (const x of v) sum += x * x
  const n = Math.sqrt(sum) || 1
  return v.map(x => x / n)
}

function dot(a: Float32Array, b: Float32Array): number {
  let s = 0
  for (let i = 0; i < a.length; i++) s += a[i] * b[i]
  return s
}

function mean(vs: Float32Array[]): Float32Array {
  const out = new Float32Array(vs[0].length)
  for (const v of vs) for (let i = 0; i < v.length; i++) out[i] += v[i]
  return normalize(out)
}

async function encodeText(text: string): Promise<Float32Array> {
  const inputs = tokenizer([text], { padding: 'max_length', max_length: 64, truncation: true })
  const { pooler_output } = await textModel(inputs)
  return normalize(pooler_output.data as Float32Array)
}

const textCache = new Map<string, Float32Array>()
const TEXT_CACHE_SIZE = 500

/** One vector for a search phrase, averaged over the templates. */
async function encodeQuery(query: string): Promise<Float32Array> {
  const cached = textCache.get(query)
  if (cached) return cached
  const v = mean(await Promise.all(TEMPLATES.map(t => encodeText(t.replace('{}', query)))))
  if (textCache.size >= TEXT_CACHE_SIZE) textCache.delete(textCache.keys().next().value!)
  textCache.set(query, v)
  return v
}

/**
 * How much more a photo matches the query than it matches anything at all.
 *
 * Raw similarity was tried first. Some photos and some phrases score high
 * against everything, so "double exposure" gave 76% to ordinary buildings and
 * a fixed cutoff both hid real cats and let junk through.
 */
function margin(query: Float32Array, id: string): number {
  return dot(query, vectors.get(id)!) - baselines.get(id)!
}

function remember(id: string, vector: Float32Array) {
  vectors.set(id, vector)
  baselines.set(id, dot(neutral, vector))
}

function toBytes(v: Float32Array): Uint8Array<ArrayBuffer> {
  return new Uint8Array(v.slice().buffer)
}

function fromBytes(b: Uint8Array): Float32Array {
  // Copied: a Buffer from the driver may sit at an offset that is not 4-aligned.
  return new Float32Array(new Uint8Array(b).buffer)
}

/**
 * Errors that mean the database could not be reached, rather than that a query
 * was wrong: the server down or restarting, the network, a full pool.
 */
function unreachable(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientInitializationError) return true
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return ['P1001', 'P1002', 'P1008', 'P1017', 'P2024'].includes(error.code)
  }
  return false
}

/**
 * The first index load, retried until the database answers.
 *
 * It used to exit on any failure. pm2 then restarted the worker, which loaded
 * the 2GB of models again only to find the database still down, in a tight
 * loop for as long as Postgres was restarting. The models are already in
 * memory here; waiting for the database costs nothing.
 */
async function syncIndexWhenReachable() {
  for (let delay = 1000; ; delay = Math.min(delay * 2, 60_000)) {
    try {
      return await syncIndex()
    } catch (error) {
      if (!unreachable(error)) throw error
      log(`database unreachable, retrying in ${delay / 1000}s:`, error instanceof Error ? error.message : error)
      await new Promise(resolve => setTimeout(resolve, delay))
    }
  }
}

async function load() {
  const options = { dtype: 'q8' as const, session_options: { intraOpNumThreads: THREADS, interOpNumThreads: 1 } }
  const started = Date.now()
  tokenizer = await AutoTokenizer.from_pretrained(EMBEDDING_REPO)
  processor = await AutoProcessor.from_pretrained(EMBEDDING_REPO)
  textModel = await SiglipTextModel.from_pretrained(EMBEDDING_REPO, options)
  visionModel = await SiglipVisionModel.from_pretrained(EMBEDDING_REPO, options)
  nudity = await ort.InferenceSession.create(await nudityModelFile(), { intraOpNumThreads: THREADS, interOpNumThreads: 1 })
  neutral = mean(await Promise.all(NEUTRAL.map(encodeText)))

  await syncIndexWhenReachable()
  log(`models loaded in ${Date.now() - started}ms, ${vectors.size} photos indexed`)
}

/** What the index holds: photos a stranger can see, the only ones search and similarity show. */
const SEARCHABLE = { model: EMBEDDING_MODEL, photo: { published: true, visibility: 'PUBLIC', screening: 'CLEAR' } } as const

/**
 * Brings the in-memory index in line with the database.
 *
 * Without it the index only grew. Deleted photos, abandoned drafts and photos
 * made private stayed in it, using up the ranks a query returns, so visible
 * matches past the cap were lost and "More like this" could come back empty.
 * New photos are added as they are processed; this removes what is no longer
 * public and loads anything that has become public since, such as a photo
 * switched from private.
 */
async function syncIndex() {
  const rows = await prisma.photoEmbedding.findMany({ where: SEARCHABLE, select: { photoId: true } })
  const keep = new Set(rows.map(r => r.photoId))
  for (const id of vectors.keys()) {
    if (!keep.has(id)) {
      vectors.delete(id)
      baselines.delete(id)
    }
  }
  const missing = rows.map(r => r.photoId).filter(id => !vectors.has(id))
  for (let i = 0; i < missing.length; i += 500) {
    const batch = await prisma.photoEmbedding.findMany({
      where: { photoId: { in: missing.slice(i, i + 500) } },
      select: { photoId: true, vector: true },
    })
    for (const row of batch) remember(row.photoId, fromBytes(row.vector))
  }
}

const SYNC_EVERY_MS = 5 * 60_000

/** The classifier file, downloaded once and refused if its hash is not the pinned one. */
async function nudityModelFile(): Promise<string> {
  const file = path.join(env.cacheDir!, 'freepik-nsfw', 'model_quantized.onnx')
  const sha = (buffer: Buffer) => createHash('sha256').update(buffer).digest('hex')
  const existing = await readFile(file).catch(() => null)
  if (existing && sha(existing) === NUDITY_SHA256) return file
  log('downloading the nudity model')
  const response = await fetch(NUDITY_URL)
  if (!response.ok) throw new Error(`nudity model download failed: ${response.status}`)
  const buffer = Buffer.from(await response.arrayBuffer())
  if (sha(buffer) !== NUDITY_SHA256) throw new Error('nudity model does not match its pinned hash')
  await mkdir(path.dirname(file), { recursive: true })
  await writeFile(`${file}.tmp`, buffer)
  await rename(`${file}.tmp`, file)
  return file
}

/** Partial nudity plus explicit, 0 to 1. */
async function scoreNudity(image: RawImage): Promise<number> {
  const rgb = image.rgb()
  return scoreNudityOf(sharp(Buffer.from(rgb.data), { raw: { width: rgb.width, height: rgb.height, channels: 3 } }))
}

async function scoreNudityOf(source: Sharp): Promise<number> {
  // Resized with sharp exactly as in the evaluation the threshold came from.
  // transformers' own resize gave the Birth of Venus 0.44 against 0.12.
  const pixels = await source
    .removeAlpha()
    .resize(NUDITY_SIZE, NUDITY_SIZE, { fit: 'fill', kernel: 'cubic' })
    .raw()
    .toBuffer()
  const plane = NUDITY_SIZE * NUDITY_SIZE
  const input = new Float32Array(3 * plane)
  for (let i = 0; i < plane; i++) {
    for (let c = 0; c < 3; c++) input[c * plane + i] = (pixels[i * 3 + c] / 255 - NUDITY_MEAN[c]) / NUDITY_STD[c]
  }
  const output = await nudity.run({ [nudity.inputNames[0]]: new ort.Tensor('float32', input, [1, 3, NUDITY_SIZE, NUDITY_SIZE]) })
  const logits = Array.from(output[nudity.outputNames[0]].data as Float32Array)
  const top = Math.max(...logits)
  const exp = logits.map(x => Math.exp(x - top))
  const total = exp.reduce((a, b) => a + b)
  // neutral, low (suggestive), medium (partial nudity), high (explicit)
  return (exp[2] + exp[3]) / total
}

async function processPhoto(
  photo: { id: string; userId: string; screening: string; nudityModel: string | null; embedding: { model: string } | null },
  download: Promise<RawImage>
) {
  const image = await download

  // Each half only when it is missing or from an older model, so changing one
  // model does not redo the other.
  const needsVector = photo.embedding?.model !== EMBEDDING_MODEL
  const needsScore = photo.nudityModel !== NUDITY_MODEL || photo.screening === 'PENDING'
  const vector = needsVector ? normalize((await visionModel(await processor(image))).pooler_output.data as Float32Array) : null
  const nudityScore = needsScore ? await scoreNudity(image) : null

  const data: Prisma.PhotoUpdateInput = {}
  if (nudityScore !== null) {
    data.nudityScore = nudityScore
    data.nudityModel = NUDITY_MODEL
    // Photos already public are held too when a newer model flags them: the
    // point is that no such photo stays up. A held photo keeps the model it
    // was scored with, so once approved it is not held again until the model
    // changes.
    //
    // Except one an admin approved after it could not be checked (UNCHECKED,
    // below). It had no model to keep, so every restart scored it again, and a
    // score over the line held it again with a fresh notification to its
    // owner, overruling the admin. Its score is recorded and nothing else.
    const holdable = photo.screening === 'PENDING' || (photo.screening === 'CLEAR' && photo.nudityModel !== UNCHECKED)
    if (nudityScore >= HOLD_AT && holdable) data.screening = 'HELD'
    else if (photo.screening === 'PENDING') data.screening = 'CLEAR'
  }

  await prisma.$transaction([
    ...(vector
      ? [prisma.photoEmbedding.upsert({
          where: { photoId: photo.id },
          create: { photoId: photo.id, model: EMBEDDING_MODEL, vector: toBytes(vector) },
          update: { model: EMBEDDING_MODEL, vector: toBytes(vector), createdAt: new Date() },
        })]
      : []),
    prisma.photo.update({ where: { id: photo.id }, data }),
    // Told straight away, so a held photo is not just one that never appeared.
    ...(data.screening === 'HELD'
      ? [prisma.notification.create({ data: { type: 'held', userId: photo.userId, actorId: photo.userId, photoId: photo.id } })]
      : []),
  ])
  if (vector) remember(photo.id, vector)
  if (data.screening === 'HELD') log(`held ${photo.id} at ${nudityScore!.toFixed(3)}`)
}

/** A stored image: a URL, or a development upload kept under public/ (LOCAL_UPLOADS in src/lib/oss.ts). */
function readImage(location: string): Promise<RawImage> {
  if (location.startsWith('/local-uploads/') && !location.includes('..')) {
    return RawImage.read(path.join(process.cwd(), 'public', location))
  }
  return download(location)
}

async function download(url: string): Promise<RawImage> {
  // Not RawImage.fromURL, which takes no signal and so had no timeout at all.
  const response = await fetch(url, { signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) })
  if (!response.ok) throw new Error(`download failed: ${response.status}`)
  return RawImage.fromBlob(await response.blob())
}

const PHOTO_SELECT = {
  id: true, userId: true, thumbnailPath: true, screening: true, nudityModel: true,
  embedding: { select: { model: true } },
} as const

/** New uploads first, oldest first; then the backfill, newest first. */
async function nextBatch() {
  const skip = [...failures].filter(([, n]) => n >= MAX_ATTEMPTS).map(([id]) => id)
  const notSkipped = skip.length ? { id: { notIn: skip } } : {}
  const pending = await prisma.photo.findMany({
    where: { screening: 'PENDING', ...notSkipped },
    orderBy: { createdAt: 'asc' },
    take: BATCH,
    select: PHOTO_SELECT,
  })
  if (pending.length) return pending
  return prisma.photo.findMany({
    where: {
      published: true,
      OR: [
        { embedding: null },
        { embedding: { model: { not: EMBEDDING_MODEL } } },
        { nudityModel: null },
        { nudityModel: { not: NUDITY_MODEL } },
      ],
      ...notSkipped,
    },
    orderBy: { createdAt: 'desc' },
    take: BATCH,
    select: PHOTO_SELECT,
  })
}

async function work() {
  for (;;) {
    let batch: Awaited<ReturnType<typeof nextBatch>> = []
    try {
      batch = await nextBatch()
    } catch (error) {
      log('could not read the queue:', error)
    }
    if (!batch.length) {
      await new Promise(resolve => setTimeout(resolve, IDLE_POLL_MS))
      continue
    }
    // Downloaded together up front: one at a time, the network wait was most
    // of each photo's turn and the models sat idle through it.
    const downloads = batch.map(photo => readImage(photo.thumbnailPath))
    for (const download of downloads) download.catch(() => {})
    for (const [i, photo] of batch.entries()) {
      try {
        await processPhoto(photo, downloads[i])
        failures.delete(photo.id)
      } catch (error) {
        // Deleted while queued: nothing to do.
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') continue
        const attempts = (failures.get(photo.id) ?? 0) + 1
        failures.set(photo.id, attempts)
        log(`failed ${photo.id} (attempt ${attempts}):`, error instanceof Error ? error.message : error)
        // A new upload that cannot be checked would otherwise wait unseen
        // for good. Held with no score, it reaches the admin queue, which
        // labels it as not checked.
        if (attempts >= MAX_ATTEMPTS && photo.screening === 'PENDING') {
          await prisma.photo.updateMany({
            where: { id: photo.id, screening: 'PENDING' },
            data: { screening: 'HELD', nudityModel: UNCHECKED },
          }).catch(() => {})
          log(`held ${photo.id}: could not be checked`)
        }
      }
    }
  }
}

function send(res: http.ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'content-type': 'application/json' })
  res.end(JSON.stringify(body))
}

function limitParam(url: URL, fallback: number, max: number): number {
  const n = Number(url.searchParams.get('limit'))
  return Number.isInteger(n) && n > 0 ? Math.min(n, max) : fallback
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost')
  try {
    if (url.pathname === '/health') {
      return send(res, 200, { ready, model: EMBEDDING_MODEL, indexed: vectors.size })
    }
    if (!ready) return send(res, 503, { error: 'loading' })

    if (url.pathname === '/search') {
      const q = (url.searchParams.get('q') ?? '').trim().slice(0, 200)
      if (!q) return send(res, 400, { error: 'q is required' })
      const query = await encodeQuery(q)
      const all = [...vectors.keys()].map(id => ({ id, score: margin(query, id) }))
      // A query that describes nothing in particular, such as "zzqx" or
      // "hi", matches the typical photo about as well as the neutral prompts
      // do, so half the library clears the cutoff. Real subjects describe
      // something specific and match the typical photo worse: measured over
      // the library, "cat" has a median margin of -0.010 and "food" -0.028,
      // while "zzqx" has +0.018 and returned 290 photos.
      //
      // A median above zero alone also caught subjects the library is full
      // of: "street", "night", "city" and "sky" all sit at +0.003 to +0.015
      // and returned nothing, while "night street" returned 130. What tells
      // them apart is spread. A real subject lifts the photos that show it
      // well above the rest, and a vague word lifts every photo alike.
      // Measured as the 99th percentile minus the median: 0.035 and up for
      // every real subject tried, 0.029 and under for every vague word.
      const sorted = all.map(r => r.score).sort((a, b) => a - b)
      const median = sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0
      const p99 = sorted.length ? sorted[Math.floor(sorted.length * 0.99)] : 0
      if (median > 0 && p99 - median < MIN_SPREAD) {
        return send(res, 200, { model: EMBEDDING_MODEL, vague: true, results: [] })
      }
      const results = all.filter(r => r.score >= MIN_MARGIN).sort((a, b) => b.score - a.score)
      return send(res, 200, { model: EMBEDDING_MODEL, results: results.slice(0, limitParam(url, 200, 1000)) })
    }

    // The check an upload asks for before anything is stored: a small copy of
    // the image in, a decision out. Nothing is written.
    if (url.pathname === '/screen' && req.method === 'POST') {
      const chunks: Buffer[] = []
      let size = 0
      for await (const chunk of req) {
        size += chunk.length
        if (size > SCREEN_MAX_BYTES) return send(res, 413, { error: 'too large' })
        chunks.push(chunk)
      }
      const score = await scoreNudityOf(sharp(Buffer.concat(chunks)))
      return send(res, 200, { model: NUDITY_MODEL, score, hold: score >= HOLD_AT })
    }

    if (url.pathname === '/similar') {
      const id = url.searchParams.get('id') ?? ''
      const target = vectors.get(id)
      if (!target) return send(res, 200, { model: EMBEDDING_MODEL, results: [] })
      const results: { id: string; score: number }[] = []
      for (const [other, v] of vectors) if (other !== id) results.push({ id: other, score: dot(target, v) })
      results.sort((a, b) => b.score - a.score)
      return send(res, 200, { model: EMBEDDING_MODEL, results: results.slice(0, limitParam(url, 60, 500)) })
    }

    send(res, 404, { error: 'not found' })
  } catch (error) {
    log('request failed:', error)
    send(res, 500, { error: 'failed' })
  }
})

// Loopback only. Nothing outside this machine has any reason to reach it.
server.listen(PORT, '127.0.0.1', () => log(`listening on 127.0.0.1:${PORT}`))

load()
  .then(() => {
    ready = true
    setInterval(() => syncIndex().catch(error => log('index sync failed:', error)), SYNC_EVERY_MS).unref()
    return work()
  })
  .catch(error => {
    log('failed to start:', error)
    process.exit(1)
  })

async function shutdown() {
  server.close()
  await prisma.$disconnect()
  process.exit(0)
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
