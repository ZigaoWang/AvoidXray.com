import { prisma } from '@/lib/db'
import { hammingDistance } from '@/lib/imageHash'

/**
 * Whether a new photo looks like one already in the owner's library.
 *
 * Two signals, both required. The perceptual hash (64 bits, from the thumb)
 * finds candidates cheaply when the photo is made; on its own it matches dark
 * or flat frames that share little but their layout. The SigLIP embedding the
 * vision worker writes a moment later confirms or clears each candidate: two
 * scans of one frame land close together, two frames of one roll do not.
 *
 * Candidates are stored on the import item (`lookalikeOfId`); the flag is
 * shown only once both photos have embeddings that agree.
 */

/** Hash distance, in bits of 64, within which a photo is a candidate. */
export const LOOKALIKE_BITS = 6

/**
 * Embedding similarity (cosine, embeddings are unit length) at or above which
 * a candidate is confirmed. Calibrated on the owners' libraries: different
 * frames of one scene that pass the hash test score just below it, exact
 * copies score 1. Null would confirm nothing.
 */
export const LOOKALIKE_SIMILARITY: number | null = 0.97

/** The closest photo in the owner's library within LOOKALIKE_BITS, if any. */
export async function lookalikeCandidate(userId: string, photoId: string, hash: string): Promise<string | null> {
  const others = await prisma.photo.findMany({
    where: { userId, kind: 'COMMUNITY', id: { not: photoId }, perceptualHash: { not: null } },
    select: { id: true, perceptualHash: true },
  })
  let best: { id: string; distance: number } | null = null
  for (const other of others) {
    const distance = hammingDistance(hash, other.perceptualHash!)
    if (distance <= LOOKALIKE_BITS && (!best || distance < best.distance)) best = { id: other.id, distance }
  }
  return best?.id ?? null
}

export type LookalikeVerdict = 'confirmed' | 'cleared' | 'pending'

/**
 * Settles candidates against their embeddings: confirmed or cleared once both
 * photos have one from the same model, pending until then.
 */
export async function settleLookalikes(pairs: { photoId: string; candidateId: string }[]): Promise<Map<string, LookalikeVerdict>> {
  const verdicts = new Map<string, LookalikeVerdict>()
  if (!pairs.length) return verdicts
  const ids = [...new Set(pairs.flatMap(p => [p.photoId, p.candidateId]))]
  const embeddings = new Map((await prisma.photoEmbedding.findMany({
    where: { photoId: { in: ids } },
    select: { photoId: true, model: true, vector: true },
  })).map(e => [e.photoId, e]))
  for (const { photoId, candidateId } of pairs) {
    const a = embeddings.get(photoId)
    const b = embeddings.get(candidateId)
    if (!a || !b || a.model !== b.model || LOOKALIKE_SIMILARITY === null) {
      verdicts.set(photoId, 'pending')
      continue
    }
    verdicts.set(photoId, similarity(a.vector, b.vector) >= LOOKALIKE_SIMILARITY ? 'confirmed' : 'cleared')
  }
  return verdicts
}

/** Cosine similarity of two stored embeddings: unit-length float32, little-endian. */
export function similarity(a: Uint8Array, b: Uint8Array): number {
  const x = new Float32Array(a.buffer.slice(a.byteOffset, a.byteOffset + a.byteLength))
  const y = new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength))
  let dot = 0
  for (let i = 0; i < Math.min(x.length, y.length); i++) dot += x[i] * y[i]
  return dot
}
