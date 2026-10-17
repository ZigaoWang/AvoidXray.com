/**
 * The vision worker: what each photo shows, and whether it can go public.
 *
 * A separate process from the site, run by pm2 next to it. The two models hold
 * about 1.1GB between them, loaded once at startup. Inside the web process that
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
 * encoding plus a dot product per photo. The site applies visibility and blocks
 * to what comes back, which is why private and pending photos can be in here.
 *
 *   npx tsx vision/worker.ts
 */
import http from 'node:http'
import path from 'node:path'
import { PrismaClient, Prisma } from '@prisma/client'
import {
  AutoProcessor,
  AutoTokenizer,
  RawImage,
  SiglipTextModel,
  SiglipVisionModel,
  env,
  pipeline,
  type ImageClassificationPipeline,
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
 * Falconsai's ViT nudity classifier. AdamCodd's, tried first, scored ordinary
 * photos of clothed people at 0.98; this one scored every public photo on the
 * site under 0.01. Apache-2.0.
 */
const NUDITY_REPO = 'onnx-community/nsfw_image_detection-ONNX'
/** The classifier's decision boundary: it calls the photo nsfw. A hold is only a review, never a removal. */
const HOLD_AT = 0.5

/**
 * The lowest margin a photo needs to count as a match (see `margin`).
 *
 * Measured on the site's photos: subjects that are not in any of them, such as
 * giraffes, top out around 0.012, and real matches start near 0.02. A query
 * with nothing above it returns nothing, which is the answer people should get.
 */
const MIN_MARGIN = 0.02

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

const PORT = Number(process.env.VISION_PORT || 3100)
/** CPU threads per model run. Kept below the core count so the site stays responsive during a backfill. */
const THREADS = Number(process.env.VISION_THREADS || 2)
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
let nudity: ImageClassificationPipeline

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

async function load() {
  const options = { dtype: 'q8' as const, session_options: { intraOpNumThreads: THREADS, interOpNumThreads: 1 } }
  const started = Date.now()
  tokenizer = await AutoTokenizer.from_pretrained(EMBEDDING_REPO)
  processor = await AutoProcessor.from_pretrained(EMBEDDING_REPO)
  textModel = await SiglipTextModel.from_pretrained(EMBEDDING_REPO, options)
  visionModel = await SiglipVisionModel.from_pretrained(EMBEDDING_REPO, options)
  nudity = await pipeline('image-classification', NUDITY_REPO, options)
  neutral = mean(await Promise.all(NEUTRAL.map(encodeText)))

  const rows = await prisma.photoEmbedding.findMany({
    where: { model: EMBEDDING_MODEL },
    select: { photoId: true, vector: true },
  })
  for (const row of rows) remember(row.photoId, fromBytes(row.vector))
  log(`models loaded in ${Date.now() - started}ms, ${rows.length} photos indexed`)
}

async function processPhoto(
  photo: { id: string; screening: string; nudityScore: number | null },
  download: Promise<RawImage>
) {
  const image = await download

  const { pooler_output } = await visionModel(await processor(image))
  const vector = normalize(pooler_output.data as Float32Array)

  // Scored once. A photo an admin approved keeps its score and is not re-held.
  let nudityScore = photo.nudityScore
  if (nudityScore === null) {
    const labels = await nudity(image, { top_k: 2 }) as { label: string; score: number }[]
    nudityScore = labels.find(l => l.label === 'nsfw')?.score ?? 0
  }

  const data: Prisma.PhotoUpdateInput = { nudityScore }
  // A cleared photo that was on the site before screening existed is held too,
  // if it scores that high: the point is that no such photo stays public.
  if (nudityScore >= HOLD_AT && photo.nudityScore === null) data.screening = 'HELD'
  else if (photo.screening === 'PENDING') data.screening = 'CLEAR'

  await prisma.$transaction([
    prisma.photoEmbedding.upsert({
      where: { photoId: photo.id },
      create: { photoId: photo.id, model: EMBEDDING_MODEL, vector: toBytes(vector) },
      update: { model: EMBEDDING_MODEL, vector: toBytes(vector), createdAt: new Date() },
    }),
    prisma.photo.update({ where: { id: photo.id }, data }),
  ])
  remember(photo.id, vector)
  if (data.screening === 'HELD') log(`held ${photo.id} at ${nudityScore.toFixed(3)}`)
}

const PHOTO_SELECT = { id: true, thumbnailPath: true, screening: true, nudityScore: true } as const

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
      OR: [{ embedding: null }, { embedding: { model: { not: EMBEDDING_MODEL } } }],
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
    const downloads = batch.map(photo => RawImage.fromURL(photo.thumbnailPath))
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
      const results: { id: string; score: number }[] = []
      for (const id of vectors.keys()) {
        const score = margin(query, id)
        if (score >= MIN_MARGIN) results.push({ id, score })
      }
      results.sort((a, b) => b.score - a.score)
      return send(res, 200, { model: EMBEDDING_MODEL, results: results.slice(0, limitParam(url, 200, 1000)) })
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
