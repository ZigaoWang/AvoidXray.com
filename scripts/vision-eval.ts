/**
 * Measures text queries against the real photo index, with the worker's own
 * scoring (vision/textSearch.ts), for tuning MIN_MARGIN and the vague-query
 * rule. Read-only: it loads the text model and the stored vectors, scores,
 * and prints. Run where the models are cached, beside the worker.
 *
 *   npx tsx scripts/vision-eval.ts "London" "Big Ben" "cat" > eval.json
 *
 * For each query: the median and 99th-percentile margin over the photos a
 * stranger can see, their spread, whether the rule calls it vague, and how
 * many photos clear the cutoff.
 */
import path from 'node:path'
import { PrismaClient } from '@prisma/client'
import { AutoTokenizer, SiglipTextModel, env } from '@huggingface/transformers'
import { MIN_MARGIN, MIN_SPREAD, NEUTRAL, dot, encodeQuery, mean, normalize, scoreQuery, type PhotoIndex } from '../vision/textSearch'

try {
  process.loadEnvFile(path.join(process.cwd(), '.env'))
} catch {
  // Already in the environment.
}
env.cacheDir = process.env.VISION_MODEL_DIR || path.join(process.cwd(), '.vision-models')

const EMBEDDING_REPO = 'onnx-community/siglip2-large-patch16-256-ONNX'
const EMBEDDING_MODEL = 'siglip2-large-patch16-256/q8'
/** Ranked matches printed per query; raise it to look down the list. */
const TOP = Number(process.env.EVAL_TOP || 5)

async function main() {
  const queries = process.argv.slice(2)
  if (!queries.length) throw new Error('name some queries')
  const prisma = new PrismaClient()
  const tokenizer = await AutoTokenizer.from_pretrained(EMBEDDING_REPO)
  const textModel = await SiglipTextModel.from_pretrained(EMBEDDING_REPO, {
    dtype: 'q8', session_options: { intraOpNumThreads: 1, interOpNumThreads: 1 },
  })
  const encodeText = async (text: string) => {
    const inputs = tokenizer([text], { padding: 'max_length', max_length: 64, truncation: true })
    const { pooler_output } = await textModel(inputs)
    return normalize(pooler_output.data as Float32Array)
  }
  const neutral = mean(await Promise.all(NEUTRAL.map(encodeText)))

  const index: PhotoIndex = { vectors: new Map(), baselines: new Map(), searchable: new Set() }
  const rows = await prisma.photoEmbedding.findMany({
    where: { model: EMBEDDING_MODEL, photo: { kind: 'COMMUNITY', uploadComplete: true, deletedAt: null } },
    select: { photoId: true, vector: true, photo: { select: { visibility: true, screening: true } } },
  })
  for (const row of rows) {
    const v = new Float32Array(new Uint8Array(row.vector).buffer)
    index.vectors.set(row.photoId, v)
    index.baselines.set(row.photoId, dot(neutral, v))
    if (row.photo.visibility === 'PUBLIC' && row.photo.screening === 'CLEAR') index.searchable.add(row.photoId)
  }

  const out = []
  for (const q of queries) {
    const vector = await encodeQuery(encodeText, q)
    const { vague, results, median, p99 } = scoreQuery(index, vector)
    // Every searchable photo's margin, for counting matches the rule refused.
    const above = [...index.searchable].filter(id => dot(vector, index.vectors.get(id)!) - index.baselines.get(id)! >= MIN_MARGIN).length
    out.push({
      q, vague, matches: results.length, aboveCutoff: above,
      median: +median.toFixed(4), p99: +p99.toFixed(4), spread: +(p99 - median).toFixed(4),
      top: results.slice(0, TOP).map(r => ({ id: r.id, score: +r.score.toFixed(4) })),
    })
  }
  console.log(JSON.stringify({
    indexed: index.vectors.size, searchable: index.searchable.size,
    minMargin: MIN_MARGIN, minSpread: MIN_SPREAD, queries: out,
  }, null, 1))
  await prisma.$disconnect()
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
