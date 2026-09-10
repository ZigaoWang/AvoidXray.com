/** Canonical site-wide SEO constants. Import these instead of hardcoding URLs. */

export const SITE_URL = 'https://avoidxray.com'
export const SITE_NAME = 'AvoidXray'

/**
 * The card a page falls back to when it has no image of its own.
 *
 * `app/opengraph-image.tsx` renders one for the whole site, and a page that
 * declares nothing inherits it. A page that declares its own `openGraph`
 * block does not: the declaration replaces the inherited object, images
 * included, so every page with a hand-written openGraph and no local
 * opengraph-image file was sharing to social with no picture at all. That was
 * the home page, explore, both catalogue indexes, the pairing pages, album
 * pages, and the three static ones.
 *
 * Spell it out here rather than in nine files so the next page to declare an
 * openGraph block has something obvious to spread in.
 */
export const OG_DEFAULT_IMAGE = {
  url: `${SITE_URL}/opengraph-image`,
  width: 1200,
  height: 630,
  alt: 'AvoidXray – Film Photography Community',
} as const

export function absoluteUrl(path: string): string {
  if (!path) return SITE_URL
  if (path.startsWith('http://') || path.startsWith('https://')) return path
  return `${SITE_URL}${path.startsWith('/') ? path : `/${path}`}`
}

// filmUrl, cameraUrl, photoUrl and userUrl were here and nothing imported any
// of them, while the paths they built were written out by hand in a dozen
// canonical URLs, sitemap entries and JSON-LD ids. Four builders that look
// like the single source of truth and are not is worse than none: renaming a
// route by editing them would have compiled cleanly and shipped canonical URLs
// pointing at pages that no longer exist. canonicalFilmPath and
// canonicalCameraPath in lib/seo/slug are what the site actually uses.
export const comboUrl = (filmSlug: string, cameraSlug: string) =>
  `/films/${filmSlug}/shot-with/${cameraSlug}`
