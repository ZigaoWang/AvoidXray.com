/**
 * URL slug generation for film stocks and cameras.
 *
 * Slugs are the public identity of a hub page (/films/kodak-gold-200), so they
 * need to be stable, unique, and keyword-bearing. Generation is deliberately
 * lossy-but-predictable: the same name always produces the same base slug, and
 * collisions are resolved by the caller appending a discriminator.
 */

/** Characters that carry meaning in film/camera names and shouldn't be dropped. */
const REPLACEMENTS: Array<[RegExp, string]> = [
  [/\+/g, '-plus'],
  [/&/g, '-and-'],
  [/×/g, 'x'],
  [/½/g, '-half'],
]

/**
 * Convert a display name into a URL-safe slug.
 *
 * "Kodak Gold 200"        -> "kodak-gold-200"
 * "Diana F+"              -> "diana-f-plus"
 * "Ilford HP5 Plus 400"   -> "ilford-hp5-plus-400"
 * "Canon AE-1 Program"    -> "canon-ae-1-program"
 */
export function slugify(input: string): string {
  let s = input.normalize('NFKD').replace(/[\u0300-\u036f]/g, '')

  for (const [pattern, replacement] of REPLACEMENTS) {
    s = s.replace(pattern, replacement)
  }

  return (
    s
      .toLowerCase()
      // Anything that isn't alphanumeric becomes a separator.
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .replace(/-{2,}/g, '-')
      .slice(0, 80)
      .replace(/-+$/, '')
  )
}

/**
 * Build the slug for an entity, preferring "brand name" over bare name so that
 * "Gold 200" becomes "kodak-gold-200" rather than the far less searchable
 * "gold-200".
 */
export function entitySlug(name: string, brand?: string | null): string {
  const base = slugify(name)
  if (!brand) return base

  const brandSlug = slugify(brand)
  // Avoid "kodak-kodak-gold-200" when the name already leads with the brand.
  if (!brandSlug || base.startsWith(`${brandSlug}-`) || base === brandSlug) return base

  return `${brandSlug}-${base}`
}

/**
 * Resolve a slug against a set of already-taken slugs, appending -2, -3, ...
 * until it's unique. Used by the backfill and by create/rename paths.
 */
export function uniqueSlug(desired: string, taken: Set<string>): string {
  const base = desired || 'item'
  if (!taken.has(base)) return base

  for (let n = 2; n < 1000; n++) {
    const candidate = `${base}-${n}`
    if (!taken.has(candidate)) return candidate
  }
  throw new Error(`Could not find a unique slug for "${desired}"`)
}

/** cuids are 25 chars of [a-z0-9] starting with "c" — used to detect legacy URLs. */
const CUID_RE = /^c[a-z0-9]{20,30}$/

export function looksLikeCuid(value: string): boolean {
  return CUID_RE.test(value)
}

/**
 * Canonical path for a film stock or camera, falling back to the cuid for a
 * record created before slugs existed.
 *
 * These live here rather than in seo/resolve because the type-ahead in the
 * header needs them, and resolve.ts imports Prisma — one import from a client
 * component would have pulled the database client into the browser bundle.
 */
export const canonicalFilmPath = (f: { id: string; slug: string | null }) =>
  `/films/${f.slug ?? f.id}`

export const canonicalCameraPath = (c: { id: string; slug: string | null }) =>
  `/cameras/${c.slug ?? c.id}`
