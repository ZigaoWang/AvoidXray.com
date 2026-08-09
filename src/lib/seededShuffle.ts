import { randomInt } from 'node:crypto'

/**
 * Deterministic shuffling.
 *
 * Photo grids are shuffled so the archive looks different between visits, but
 * re-rolling that order on every render breaks two things:
 *
 *   - Going back from a photo restores the scroll position while the grid
 *     underneath has been reordered, so the reader lands somewhere unrelated
 *     and loses their place.
 *   - A client component that shuffles during render disagrees with its own
 *     server-rendered HTML, and shuffling after mount instead makes the grid
 *     visibly jump a moment after load.
 *
 * Seeding the shuffle fixes both: the same seed always produces the same order,
 * so the server and the browser agree, and returning to a page reproduces the
 * grid exactly. The seed changes daily, which keeps the variety that the random
 * order was there for in the first place.
 */

/** mulberry32 — small, fast, and good enough for shuffling a photo list. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Fisher-Yates driven by a seeded generator. Same input and seed always give
 * the same output, on the server and in the browser alike.
 */
export function seededShuffle<T>(array: readonly T[], seed: number): T[] {
  const result = [...array]
  const random = mulberry32(seed)
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

/**
 * Seed that holds steady for a UTC day.
 *
 * Computed on the server and handed to client components as a prop rather than
 * recomputed in the browser: the two clocks can straddle midnight, and a seed
 * that disagrees by one would reorder the grid during hydration — the exact
 * glitch this is meant to remove.
 */
export function dailySeed(now: Date = new Date()): number {
  return Math.floor(now.getTime() / (1000 * 60 * 60 * 24))
}

/**
 * A fresh seed, for feeds that should differ on every visit.
 *
 * crypto rather than Math.random so this is not an impure call during a server
 * render. The value is generated once per request and handed to the client, so
 * the grid the reader sees and the pages fetched as they scroll agree on one
 * ordering — the two used different sources previously, and photos appearing in
 * both were silently dropped.
 */
export function randomSeed(): number {
  return randomInt(1, 2 ** 31 - 1)
}
