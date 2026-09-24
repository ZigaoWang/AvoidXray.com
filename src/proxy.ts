import { NextResponse, type NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { looksLikeCuid } from '@/lib/seo/slug'
import { MIN_PAIR_PHOTOS } from '@/lib/seo/pairs'
import { PUBLIC_PHOTO } from '@/lib/photoVisibility'
import { TOP_LEVEL_PAGES, TOP_LEVEL_PREFIXES } from '@/lib/topLevelRoutes'

/**
 * Decides, before rendering starts, whether a detail URL exists at all.
 *
 * Both answers here have to be settled before the page streams. Calling
 * permanentRedirect() or notFound() inside a streaming Server Component is too
 * late to set an HTTP status: the redirect falls back to a client-side one, and
 * a missing entry answers 200 under a "Not found" title because the route's
 * loading.tsx has already flushed the shell. Google treats a real 308 far more
 * decisively, and reports the 200s as soft 404s and keeps recrawling them.
 *
 * Redirects cover a legacy cuid and a slug an entry used to live at before it
 * was renamed; both are already linked to and indexed. Everything else that
 * names nothing is rewritten to the not-found page, which answers 404.
 *
 * Only existence is checked. Whether this viewer may see a private photo or
 * album is the page's question, and that page carries its own noindex.
 *
 * Proxy always runs on the Node.js runtime (so Prisma is available) and must
 * not declare a `runtime` config — doing so is a build error. The matcher skips
 * Next's own assets, the API, and anything with a file extension.
 */

export const config = {
  matcher: ['/((?!_next/|api/|.*\\.).+)'],
}

type GearKind = 'film' | 'camera'

/**
 * The slug a film or camera param should be served under, or null when it
 * names nothing. An entry created before the slug backfill has none and keeps
 * its cuid.
 */
async function currentGearSlug(kind: GearKind, param: string): Promise<string | null> {
  const bySlug = (slug: string) =>
    kind === 'film'
      ? prisma.filmStock.findUnique({ where: { slug }, select: { id: true } })
      : prisma.camera.findUnique({ where: { slug }, select: { id: true } })
  const byId = async (id: string) => {
    const row =
      kind === 'film'
        ? await prisma.filmStock.findUnique({ where: { id }, select: { id: true, slug: true } })
        : await prisma.camera.findUnique({ where: { id }, select: { id: true, slug: true } })
    return row ? (row.slug ?? row.id) : null
  }

  if (await bySlug(param)) return param
  if (looksLikeCuid(param)) return byId(param)

  // A slug this kind used to use. Nothing is written here for a slug still in
  // use, so a hit means the entry has moved.
  const retired = await prisma.slugHistory.findUnique({
    where: { kind_slug: { kind, slug: param } },
    select: { targetId: true },
  })
  return retired ? byId(retired.targetId) : null
}

/** Both params are what currentGearSlug returned: a slug, or an unslugged cuid. */
async function pairingHasPage(film: string, camera: string): Promise<boolean> {
  const count = await prisma.photo.count({
    where: {
      ...PUBLIC_PHOTO,
      filmStock: { OR: [{ slug: film }, { id: film }] },
      camera: { OR: [{ slug: camera }, { id: camera }] },
    },
  })
  return count >= MIN_PAIR_PHOTOS
}

function notFoundResponse(request: NextRequest) {
  return NextResponse.rewrite(new URL('/_not-found', request.url), { status: 404 })
}

async function gearRoute(request: NextRequest, segments: string[]) {
  const [collection, param, ...rest] = segments
  const slug = await currentGearSlug(collection === 'films' ? 'film' : 'camera', param)
  if (!slug) return notFoundResponse(request)

  // /films/<film>/shot-with/<camera>: the camera segment moves and goes missing
  // the same way the film does, and both are fixed in one hop.
  const isPairing = collection === 'films' && rest[0] === 'shot-with' && !!rest[1]
  if (isPairing) {
    const cameraSlug = await currentGearSlug('camera', rest[1])
    if (!cameraSlug) return notFoundResponse(request)
    rest[1] = cameraSlug
  }

  const pathname = `/${[collection, slug, ...rest].join('/')}`
  if (pathname === request.nextUrl.pathname) {
    // Both halves exist, but a pairing with too few photos has no page.
    if (isPairing && !(await pairingHasPage(slug, rest[1]))) return notFoundResponse(request)
    return NextResponse.next()
  }

  const target = new URL(request.nextUrl)
  target.pathname = pathname
  return NextResponse.redirect(target, 308)
}

async function exists(segments: string[]): Promise<boolean> {
  const [first, second] = segments

  if (first === 'photos') {
    return !!(await prisma.photo.findUnique({ where: { id: second }, select: { id: true } }))
  }
  if (first === 'albums') {
    return !!(await prisma.collection.findUnique({ where: { id: second }, select: { id: true } }))
  }
  return !!(await prisma.user.findUnique({ where: { username: first }, select: { id: true } }))
}

export async function proxy(request: NextRequest) {
  try {
    const segments = request.nextUrl.pathname.split('/').filter(Boolean).map(decodeURIComponent)
    const [first, second] = segments

    if ((first === 'films' || first === 'cameras') && second) return await gearRoute(request, segments)

    // /discover and /photos have routes beneath them and none of their own, so
    // the bare path would otherwise fall through to [username].
    if (TOP_LEVEL_PREFIXES.has(first) && !second) return notFoundResponse(request)

    const isEntry =
      ((first === 'photos' || first === 'albums') && second && second !== 'create') ||
      (!TOP_LEVEL_PAGES.has(first) && !TOP_LEVEL_PREFIXES.has(first))

    if (isEntry && !(await exists(segments))) return notFoundResponse(request)
  } catch (error) {
    // A malformed escape or a failed lookup is no reason to take the page down
    // with it; the page makes the same lookup and handles its own failure.
    console.error('proxy lookup failed', error)
  }

  return NextResponse.next()
}
