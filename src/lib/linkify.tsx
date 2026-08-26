import Link from 'next/link'
import { SITE_URL } from './seo/site'

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

/** Characters that end a sentence rather than a URL. */
const TRAILING_CHARS = new Set(['.', ',', ';', ':', '!', '?', ')', ']', '}', "'", '"'])

/** Closing brackets, and the opener each one balances. */
const CLOSERS: Record<string, string> = { ')': '(', ']': '[', '}': '{' }

/**
 * Derived from the configured site URL rather than written out again.
 *
 * These were two hardcoded strings, so moving to another domain would quietly
 * turn every self-citation into an external link — still working, but leaving
 * the app shell on each click and passing nofollow to ourselves.
 */
const SITE_HOSTS = (() => {
  const hosts = new Set<string>()
  try {
    const host = new URL(SITE_URL).hostname.toLowerCase()
    hosts.add(host)
    hosts.add(host.startsWith('www.') ? host.slice(4) : `www.${host}`)
  } catch {
    // A malformed SITE_URL must not take the notes down; every link then
    // renders as external, which is the safe direction to fail in.
  }
  return hosts
})()

function count(text: string, char: string): number {
  let n = 0
  for (const c of text) if (c === char) n++
  return n
}

/**
 * Splits a matched run into the URL and any sentence punctuation trailing it,
 * keeping a bracket the URL itself opened.
 *
 * Stripping every trailing bracket broke a whole class of real links —
 * `…/wiki/Film_(disambiguation)` lost its closing parenthesis and 404ed — while
 * keeping them would swallow the bracket in "(see https://example.com)".
 * Counting decides which case this is.
 */
function splitTrailing(raw: string): { url: string; trailing: string } {
  let end = raw.length

  while (end > 0) {
    const char = raw[end - 1]
    if (!TRAILING_CHARS.has(char)) break

    const opener = CLOSERS[char]
    if (opener) {
      const inner = raw.slice(0, end)
      // Balanced: this bracket belongs to the URL, so stop trimming.
      if (count(inner, opener) >= count(inner, char)) break
    }
    end--
  }

  return { url: raw.slice(0, end), trailing: raw.slice(end) }
}

/**
 * The path to link to when a URL points back at this site, or null.
 *
 * Rejects a path beginning with `//`. `https://avoidxray.com//evil.com` parses
 * with our own hostname, so it passed the host check, but its pathname is
 * protocol-relative: rendered into an href it sends the reader to evil.com,
 * looking like an internal link and skipping the nofollow and noopener that
 * every external link here carries.
 */
function internalPath(url: string): string | null {
  try {
    const parsed = new URL(url)
    if (!SITE_HOSTS.has(parsed.hostname.toLowerCase())) return null

    const path = `${parsed.pathname}${parsed.search}${parsed.hash}`
    if (!path.startsWith('/') || path.startsWith('//')) return null
    return path
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
  // Defensive: this renders whatever a record holds, and a non-string there
  // would otherwise throw inside a server component.
  if (typeof text !== 'string' || text.length === 0) return []

  const nodes: React.ReactNode[] = []
  let lastIndex = 0
  let key = 0

  for (const match of text.matchAll(URL_PATTERN)) {
    const start = match.index
    const raw = match[0]

    const { url, trailing } = splitTrailing(raw)
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
