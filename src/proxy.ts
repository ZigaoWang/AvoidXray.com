import { NextResponse, type NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { looksLikeCuid } from '@/lib/seo/slug'

/**
 * Permanent redirects to the URL an entry currently lives at.
 *
 * This has to happen here rather than in the page: calling permanentRedirect()
 * inside a streaming Server Component is too late to set an HTTP status, so
 * Next falls back to a client-side redirect. Google treats a real 308 far more
 * decisively, and these URLs are already in the index.
 *
 * Two things reach here. A legacy cuid, which is what this was built for, and a
 * slug an entry used to live at before it was renamed. The second was handled
 * only by the page, which meant it got the same weak client-side redirect for
 * the same reason, and renaming is no longer rare: the suggest-edit form offers
 * it, and every rename retires a slug that is already linked to and indexed.
 *
 * A retired slug costs one indexed point lookup on (kind, slug), which is the
 * table's primary key. A cuid is recognized by shape and never reaches it.
 *
 * Proxy always runs on the Node.js runtime (so Prisma is available) and must
 * not declare a `runtime` config — doing so is a build error. The matcher keeps
 * this off every other route.
 */

export const config = {
  matcher: ['/films/:path*', '/cameras/:path*'],
}

export async function proxy(request: NextRequest) {
  const segments = request.nextUrl.pathname.split('/').filter(Boolean)
  // ['films', '<param>', ...rest]
  const [collection, param, ...rest] = segments

  if (!param) return NextResponse.next()

  const isFilm = collection === 'films'
  const kind = isFilm ? 'film' : 'camera'

  const currentSlug = async (id: string) =>
    isFilm
      ? (await prisma.filmStock.findUnique({ where: { id }, select: { slug: true } }))?.slug
      : (await prisma.camera.findUnique({ where: { id }, select: { slug: true } }))?.slug

  let slug: string | null | undefined

  if (looksLikeCuid(param)) {
    slug = await currentSlug(param)
  } else {
    // A slug this kind used to use. Nothing is written here for a slug still in
    // use, so a hit means the entry has moved.
    const retired = await prisma.slugHistory.findUnique({
      where: { kind_slug: { kind, slug: param } },
      select: { targetId: true },
    })
    if (!retired) return NextResponse.next()
    slug = await currentSlug(retired.targetId)
  }

  // Nothing to move to, or already there.
  if (!slug || slug === param) return NextResponse.next()

  // Preserve anything deeper in the path (e.g. /shot-with/<camera>) and the query.
  const target = new URL(request.nextUrl)
  target.pathname = `/${[collection, slug, ...rest].join('/')}`

  return NextResponse.redirect(target, 308)
}
