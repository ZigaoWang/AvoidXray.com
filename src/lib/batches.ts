/**
 * How many photos one bulk request carries. `/api/photos/bulk` takes at most
 * this many and refuses more, so a large selection is sent in batches rather
 * than the bound raised.
 */
export const BULK_BATCH = 200

/**
 * A bulk job that stopped partway. Earlier batches have already been applied,
 * so the caller has to say how many and refresh what is on screen.
 */
export class BatchFailure extends Error {
  constructor(message: string, readonly done: number, readonly processed: string[]) {
    super(message)
  }
}

/**
 * Runs `run` over `ids` one batch at a time and adds up what `tally` reports.
 *
 * A selection larger than one request used to be cut short silently: the
 * screen said "Apply to 800", the server changed the first two hundred, and
 * the toast agreed with the server while the person read it as the number
 * they had asked for.
 */
export async function inBatches<T>(
  ids: string[],
  run: (batch: string[]) => Promise<T>,
  tally: (result: T) => number,
  { size = BULK_BATCH, onProgress }: { size?: number; onProgress?: (sent: number) => void } = {},
): Promise<number> {
  let done = 0
  for (let at = 0; at < ids.length; at += size) {
    try {
      done += tally(await run(ids.slice(at, at + size)))
    } catch (error) {
      throw new BatchFailure(error instanceof Error ? error.message : 'Could not reach the server', done, ids.slice(0, at))
    }
    onProgress?.(Math.min(ids.length, at + size))
  }
  return done
}
