/**
 * The rules a batch export runs under, and what it says afterwards.
 *
 * Here rather than in the dialog because these are the parts that can quietly
 * be wrong. A browser download indicator reports that a file arrived and
 * nothing about what is missing from it, so an archive that is short of the
 * selection has to explain itself — and an explanation that names the wrong
 * reason ("4 could not be rendered" for a batch somebody stopped at 4) is worse
 * than none, because it sends the reader looking for a fault that is not there.
 */

/**
 * How many photographs one press will export.
 *
 * Not a guess at what is reasonable, but what the two things downstream will
 * take. The render is one at a time and costs a few seconds each, so sixty is
 * already several minutes of watching a progress bar; and the route allows a
 * hundred and twenty exports every five minutes per connection, which a longer
 * run would spend and then start failing partway through. A selection larger
 * than this is not silently trimmed — the panel says which sixty it is taking.
 */
export const MAX_BATCH = 60

/**
 * How large an archive gets before a batch stops adding to it.
 *
 * Full resolution on this library reaches sixty megapixels, near fifteen
 * megabytes a frame, so a long batch can build something no phone will finish
 * downloading. Reaching the ceiling is not an error: what is already built is
 * handed over, and the reader is told where it stopped and why.
 */
export const ARCHIVE_CEILING_BYTES = 400 * 1024 * 1024

export interface BatchOutcome {
  /** Photographs that made it into the archive. */
  built: number
  /** Photographs the batch set out to export. */
  total: number
  /** Renders that failed and were stepped over, one frame each. */
  skipped: number
  /** Somebody pressed Stop. */
  stopped: boolean
  /** The archive reached ARCHIVE_CEILING_BYTES. */
  full: boolean
  /** The server asked for the whole run to stop, in its own words. */
  refused: string | null
}

/**
 * What to say about an archive that is not the whole selection.
 *
 * Null when there is nothing to say, which is the ordinary case: everything
 * asked for is in the file and the download speaks for itself.
 *
 * The order is deliberate, because more than one of these can be true at once
 * and only the first cause is worth reading. A run refused at frame nine has
 * also skipped nothing and stopped nowhere; a batch that hit its size limit
 * after two failures is short by far more than those two. Each answer names the
 * reason that actually decided how long the archive is.
 */
export function describeBatch(outcome: BatchOutcome): string | null {
  const { built, total, skipped, stopped, full, refused } = outcome

  // Nothing to hand over, so the whole message is the reason there is nothing.
  if (built === 0) {
    if (refused) return refused
    if (stopped) return 'Stopped before anything was built.'
    return 'None of these could be exported. Please try again.'
  }

  // The server's own words first — it is the only one of these that says
  // something about when to try again.
  if (refused) {
    return `${refused} The archive holds the ${built} built before that.`
  }
  if (full) {
    return `The archive reached its size limit at ${built} photograph${built === 1 ? '' : 's'}. `
      + 'Export the rest separately, or choose Post rather than Full.'
  }
  if (stopped) {
    return `Stopped at ${built} of ${total}. The archive holds the ones already built.`
  }
  if (skipped > 0) {
    return `${skipped} of ${total} could not be rendered and ${skipped === 1 ? 'is' : 'are'} not in the archive.`
  }
  return null
}
