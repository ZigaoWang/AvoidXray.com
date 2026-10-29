import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { currentUserId } from '@/lib/admin/auth'
import { canOpenPhotoPage } from '@/lib/photoVisibility'
import { publicObjectUrl, signedObjectUrl, signedUrlWindowEnd } from '@/lib/oss'
import type { PhotoVariant } from '@/lib/photoStorage'

/**
 * One version of a photo, for a viewer allowed to see it.
 *
 * Redirects rather than relaying the bytes, so a library of large scans is
 * never streamed through this machine. A private file gets a signed address
 * that stops working within two hours; a public one gets its ordinary address.
 *
 * The original is for its owner only, whatever the photo's visibility. Every
 * other viewer, an admin included, gets the display versions, which carry no
 * metadata.
 *
 * Anyone not allowed gets the same 404 as for a photo that does not exist, so
 * the route cannot be used to test whether an id is real.
 */

const VARIANTS = new Set<PhotoVariant>(['thumb', 'medium', 'large', 'original'])

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; variant: string }> }
) {
  const { id, variant } = await params
  if (!VARIANTS.has(variant as PhotoVariant)) return notFound()

  const photo = await prisma.photo.findUnique({
    where: { id },
    select: {
      kind: true, userId: true, uploadComplete: true, visibility: true, screening: true, deletedAt: true,
      imagesPublic: true, originalKey: true, thumbKey: true, mediumKey: true, largeKey: true,
      originalFilename: true,
    },
  })
  if (!photo) return notFound()

  const viewerId = await currentUserId()
  const isOwner = viewerId !== null && photo.userId === viewerId

  if (variant === 'original') {
    if (!isOwner || !photo.originalKey) return notFound()
    const url = await signedObjectUrl(photo.originalKey, { download: photo.originalFilename ?? undefined })
    return redirect(url)
  }

  // A photo in the trash is gone for everyone but its owner.
  if (photo.deletedAt && !isOwner) return notFound()
  const isAdmin = !isOwner && viewerId !== null
    && (await prisma.user.findUnique({ where: { id: viewerId }, select: { isAdmin: true } }))?.isAdmin === true
  if (!canOpenPhotoPage(photo, viewerId ? { id: viewerId, isAdmin } : null)) return notFound()

  // A photo stored before large versions existed falls back to medium.
  const key = variant === 'thumb' ? photo.thumbKey
    : variant === 'large' ? (photo.largeKey ?? photo.mediumKey)
    : photo.mediumKey
  return redirect(photo.imagesPublic ? publicObjectUrl(key) : await signedObjectUrl(key))
}

/**
 * Cached by the viewer's browser for the rest of the signing window, the time
 * in which signing again would produce this same address. Never by a shared
 * cache: the answer depends on who is asking.
 */
function redirect(url: string): NextResponse {
  const seconds = Math.max(0, Math.floor((signedUrlWindowEnd() - Date.now()) / 1000))
  return new NextResponse(null, {
    status: 302,
    headers: { Location: url, 'Cache-Control': `private, max-age=${seconds}` },
  })
}

function notFound(): NextResponse {
  return NextResponse.json({ error: 'Not found' }, { status: 404, headers: { 'Cache-Control': 'private, no-store' } })
}
