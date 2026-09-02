import { cache } from 'react'
import { prisma } from '@/lib/db'
import { permanentRedirect } from 'next/navigation'
import { looksLikeCuid } from './slug'

/**
 * Resolve a /films/[slug] or /cameras/[slug] route param.
 *
 * The param may be either the new slug or a legacy cuid, because Google has the
 * cuid URLs indexed and inbound links exist in the wild.
 *
 * Legacy cuids are normally caught by middleware.ts, which issues a real HTTP
 * 308 before rendering starts. The permanentRedirect below is a fallback for
 * anything middleware misses — note that once rendering has begun streaming,
 * Next can only emit a client-side redirect rather than a 308 status, which is
 * a weaker signal. Either way the page also carries a canonical pointing at the
 * slug URL, so ranking still consolidates.
 *
 * Returns null when nothing matches, so the caller can call notFound().
 */
export async function resolveFilmSlug(param: string) {
  // Reuses the cached read, so a page whose generateMetadata already looked
  // this film up does not query for it a second time.
  const found = await lookupFilm(param)
  if (!found) return null

  // A film with no slug yet (created before the backfill) still renders under
  // its cuid rather than 404ing.
  if (found.slug && found.slug !== param) permanentRedirect(`/films/${found.slug}`)
  return found
}

export async function resolveCameraSlug(param: string) {
  const found = await lookupCamera(param)
  if (!found) return null

  if (found.slug && found.slug !== param) permanentRedirect(`/cameras/${found.slug}`)
  return found
}

/**
 * Lightweight variant for generateMetadata, which must not trigger the redirect
 * (Next runs it in parallel with the page render, and throwing there produces a
 * confusing double-redirect). Returns the record or null, never redirects.
 */
export const lookupFilm = cache(async (param: string) => {
  return (
    (await prisma.filmStock.findUnique({ where: { slug: param } })) ??
    (looksLikeCuid(param) ? await prisma.filmStock.findUnique({ where: { id: param } }) : null)
  )
})

export const lookupCamera = cache(async (param: string) => {
  return (
    (await prisma.camera.findUnique({ where: { slug: param } })) ??
    (looksLikeCuid(param) ? await prisma.camera.findUnique({ where: { id: param } }) : null)
  )
})

/**
 * Re-exported so the many server components already importing them from here
 * keep working. They are defined in seo/slug, which has no Prisma import and
 * can therefore also be reached from a client component.
 */
export { canonicalFilmPath, canonicalCameraPath } from './slug'
