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
  const bySlug = await prisma.filmStock.findUnique({ where: { slug: param } })
  if (bySlug) return bySlug

  if (looksLikeCuid(param)) {
    const byId = await prisma.filmStock.findUnique({ where: { id: param } })
    // A film with no slug yet (created before the backfill) still renders under
    // its cuid rather than 404ing.
    if (byId?.slug) permanentRedirect(`/films/${byId.slug}`)
    if (byId) return byId
  }

  return null
}

export async function resolveCameraSlug(param: string) {
  const bySlug = await prisma.camera.findUnique({ where: { slug: param } })
  if (bySlug) return bySlug

  if (looksLikeCuid(param)) {
    const byId = await prisma.camera.findUnique({ where: { id: param } })
    if (byId?.slug) permanentRedirect(`/cameras/${byId.slug}`)
    if (byId) return byId
  }

  return null
}

/**
 * Lightweight variant for generateMetadata, which must not trigger the redirect
 * (Next runs it in parallel with the page render, and throwing there produces a
 * confusing double-redirect). Returns the record or null, never redirects.
 */
export async function lookupFilm(param: string) {
  return (
    (await prisma.filmStock.findUnique({ where: { slug: param } })) ??
    (looksLikeCuid(param) ? await prisma.filmStock.findUnique({ where: { id: param } }) : null)
  )
}

export async function lookupCamera(param: string) {
  return (
    (await prisma.camera.findUnique({ where: { slug: param } })) ??
    (looksLikeCuid(param) ? await prisma.camera.findUnique({ where: { id: param } }) : null)
  )
}

/** Canonical path for a film/camera, falling back to the cuid if unslugged. */
export const canonicalFilmPath = (f: { id: string; slug: string | null }) =>
  `/films/${f.slug ?? f.id}`
export const canonicalCameraPath = (c: { id: string; slug: string | null }) =>
  `/cameras/${c.slug ?? c.id}`
