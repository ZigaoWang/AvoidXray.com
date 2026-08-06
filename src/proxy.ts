import { NextResponse, type NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { looksLikeCuid } from '@/lib/seo/slug'

/**
 * Permanent redirects from legacy cuid URLs to slug URLs.
 *
 * This has to happen here rather than in the page: calling permanentRedirect()
 * inside a streaming Server Component is too late to set an HTTP status, so
 * Next falls back to a client-side redirect. Google treats a real 308 far more
 * decisively, and these URLs are already in the index.
 *
 * Proxy always runs on the Node.js runtime (so Prisma is available) and must
 * not declare a `runtime` config — doing so is a build error. The matcher keeps
 * this off every other route, and the cuid shape check means an ordinary slug
 * request never touches the database.
 */

export const config = {
  matcher: ['/films/:path*', '/cameras/:path*'],
}

export async function proxy(request: NextRequest) {
  const segments = request.nextUrl.pathname.split('/').filter(Boolean)
  // ['films', '<param>', ...rest]
  const [collection, param, ...rest] = segments

  if (!param || !looksLikeCuid(param)) return NextResponse.next()

  const slug =
    collection === 'films'
      ? (await prisma.filmStock.findUnique({ where: { id: param }, select: { slug: true } }))?.slug
      : (await prisma.camera.findUnique({ where: { id: param }, select: { slug: true } }))?.slug

  if (!slug) return NextResponse.next()

  // Preserve anything deeper in the path (e.g. /shot-with/<camera>) and the query.
  const target = new URL(request.nextUrl)
  target.pathname = `/${[collection, slug, ...rest].join('/')}`

  return NextResponse.redirect(target, 308)
}
