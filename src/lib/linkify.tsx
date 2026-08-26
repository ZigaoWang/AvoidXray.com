import Link from 'next/link'

/**
 * Turns bare URLs in user-written text into links.
 *
 * Returns React elements rather than an HTML string on purpose: community
 * notes are user input, and building markup for them would mean trusting that
 * input. Everything outside a matched URL stays a text node, so it cannot be
 * anything but text.
 *
 * Links to our own domain render as <Link> and navigate client-side, which
 * matters because people cite photo pages on the same site. Everything else
 * opens in a new tab and carries rel="nofollow noopener noreferrer" — nofollow
 * because a note is user-generated and we do not want to pass ranking to
 * whatever gets pasted into one.
 */

// Deliberately conservative: http(s) only, so a stray "example.com" in prose
// is left alone. Trailing punctuation is trimmed below rather than matched,
// since a URL at the end of a sentence should not swallow the period.
const URL_PATTERN = /https?:\/\/[^\s<>"']+/gi

const TRAILING_PUNCTUATION = /[.,;:!?)\]}'"]+$/

const SITE_HOSTS = new Set(['avoidxray.com', 'www.avoidxray.com'])

function internalPath(url: string): string | null {
  try {
    const parsed = new URL(url)
    if (!SITE_HOSTS.has(parsed.hostname.toLowerCase())) return null
    return `${parsed.pathname}${parsed.search}${parsed.hash}`
  } catch {
    return null
  }
}

const MAX_LABEL = 48

/**
 * Shortens a URL for display without changing where it points.
 *
 * Our own host is dropped — on avoidxray.com it is noise, and "/photos/…" is
 * clearer than repeating the domain on every citation.
 */
function label(url: string, path: string | null): string {
  if (path) return path.length > MAX_LABEL ? `${path.slice(0, MAX_LABEL - 1)}…` : path
  try {
    const parsed = new URL(url)
    const tail = `${parsed.pathname}${parsed.search}`.replace(/\/$/, '')
    const shown = `${parsed.hostname.replace(/^www\./, '')}${tail}`
    return shown.length > MAX_LABEL ? `${shown.slice(0, MAX_LABEL - 1)}…` : shown
  } catch {
    return url
  }
}

const LINK_CLASS =
  'text-[#D32F2F] hover:underline underline-offset-2 break-all'

export function linkify(text: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = []
  let lastIndex = 0
  let key = 0

  for (const match of text.matchAll(URL_PATTERN)) {
    const start = match.index
    const raw = match[0]

    // Give back any trailing punctuation the pattern swept up, so
    // "see https://example.com/a." links to /a and keeps the period.
    const trailing = TRAILING_PUNCTUATION.exec(raw)?.[0] ?? ''
    const url = trailing ? raw.slice(0, raw.length - trailing.length) : raw
    if (!url) continue

    if (start > lastIndex) nodes.push(text.slice(lastIndex, start))

    const path = internalPath(url)
    nodes.push(
      path ? (
        <Link key={key++} href={path} className={LINK_CLASS}>
          {label(url, path)}
        </Link>
      ) : (
        <a
          key={key++}
          href={url}
          target="_blank"
          rel="nofollow noopener noreferrer"
          className={LINK_CLASS}
        >
          {label(url, null)}
        </a>
      )
    )

    if (trailing) nodes.push(trailing)
    lastIndex = start + raw.length
  }

  if (lastIndex < text.length) nodes.push(text.slice(lastIndex))
  return nodes
}
