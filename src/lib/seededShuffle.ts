import { randomInt } from 'node:crypto'

/**
 * Seeds for the random photo feeds.
 *
 * Photo grids are ordered so the archive looks different between visits, but
 * re-rolling that order on every render breaks two things:
 *
 *   - Going back from a photo restores the scroll position while the grid
 *     underneath has been reordered, so the reader lands somewhere unrelated
 *     and loses their place.
 *   - The first screen and the pages fetched as the reader scrolls come from
 *     separate queries, so an order neither of them agrees on puts the same
 *     photo in both and MasonryGrid's dedupe silently drops it.
 *
 * A seed fixes both: the callers order by `md5(id || seed)` in SQL, so the same
 * seed always reproduces the same grid and every request for it lands in the
 * same shuffle. Ordering in the database also keeps the cost flat as the
 * archive grows — nothing is loaded but the rows shown, which is why the
 * Fisher-Yates that used to live here is gone.
 */

/**
 * Seed that holds steady for a UTC day.
 *
 * What the random feed falls back to when a caller asks for a page without
 * naming the seed its first page used. Such a caller cannot be kept in one
 * shuffle, but a day-stable seed at least keeps it consistent with itself for
 * the length of a session rather than re-rolling per request and handing back
 * photos it has already shown.
 */
export function dailySeed(now: Date = new Date()): number {
  return Math.floor(now.getTime() / (1000 * 60 * 60 * 24))
}

/**
 * A fresh seed, for feeds that should differ on every visit.
 *
 * crypto rather than Math.random so this is not an impure call during a server
 * render. Drawn once per request and handed to the client, which quotes it back
 * on every page it fetches.
 */
export function randomSeed(): number {
  return randomInt(1, 2 ** 31 - 1)
}
