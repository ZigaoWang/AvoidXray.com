/**
 * Keeps old image addresses out of the error log.
 *
 * The image optimizer logs every upstream failure as an error, including the
 * bucket answering 404 (or 403, which is what a private bucket says for a key
 * that does not exist) for a file that was replaced or deleted. Those come
 * from crawlers and old pages holding addresses that are gone, and they buried
 * the lines that mean something. A missing file is logged at info instead;
 * timeouts, other statuses and network errors stay errors.
 *
 * Next writes these as console.error(prefix, 'upstream image response failed
 * for', href, status) from its own logger, so the filter matches that call.
 */
const FAILED = 'upstream image response failed for'
const MISSING = new Set([403, 404])

/** The info line for a missing upstream file, or null to log as it was. */
export function missingImageLine(args: unknown[]): string | null {
  const [, message, href, status] = args
  if (message !== FAILED || typeof href !== 'string' || typeof status !== 'number') return null
  if (!MISSING.has(status)) return null
  let key: string
  try {
    key = new URL(href).pathname.slice(1)
  } catch {
    return null
  }
  return `[image] no file at ${key} (${status}), an old address`
}

export function quietMissingImages() {
  const error = console.error.bind(console)
  console.error = (...args: unknown[]) => {
    const line = missingImageLine(args)
    if (line) console.info(line)
    else error(...args)
  }
}
