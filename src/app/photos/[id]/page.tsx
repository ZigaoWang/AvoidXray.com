import { prisma } from '@/lib/db'
import { notFound } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import OwnerControls from './OwnerControls'
import LikeButton from '@/components/LikeButton'
import CommentSection from '@/components/CommentSection'
import Lightbox from '@/components/Lightbox'
import WatermarkButton from '@/components/WatermarkButton'
import type { Metadata } from 'next'
import { blurHashToDataURL } from '@/lib/blurhash'
import JsonLd from '@/components/JsonLd'
import { photoAlt, photoTitle, photoDescription, photographerName, displayName, gearImageAlt } from '@/lib/seo/alt'
import { photoJsonLd, breadcrumbJsonLd } from '@/lib/seo/jsonld'
import { canonicalFilmPath, canonicalCameraPath } from '@/lib/seo/resolve'
import { SITE_URL } from '@/lib/seo/site'
import { publicUserSelect } from '@/lib/publicUser'
import { feedWhere, parseFeedScope } from '@/lib/photoFeed'
import { PUBLIC_PHOTO, canViewPhoto } from '@/lib/photoVisibility'

/** Bytes as a human-readable size, matching the previous HeadObject output. */
function formatBytes(bytes: number | null | undefined): string {
  if (!bytes || bytes <= 0) return ''
  const mb = bytes / (1024 * 1024)
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${(bytes / 1024).toFixed(0)} KB`
}


/**
 * The scope keys the grid passes through when it links to a photo, so
 * prev/next can walk the same list you were looking at. Anything else in the
 * query string is ignored.
 */
function scopeParams(query: Record<string, string | string[] | undefined>): string {
  const params = new URLSearchParams()
  for (const key of ['filmStockId', 'cameraId', 'username', 'albumId', 'day'] as const) {
    const value = query[key]
    if (typeof value === 'string' && value) params.set(key, value)
  }
  return params.toString()
}

/**
 * The viewer's id when the scope they are navigating is their own, so their
 * private photos stay in the sequence. Verified against the database — a
 * crafted albumId in the URL must not expose anything.
 */
async function resolveScopeOwner(
  scope: ReturnType<typeof parseFeedScope>,
  viewerId: string
): Promise<string | null> {
  if (scope.username) {
    const owner = await prisma.user.findUnique({
      where: { username: scope.username },
      select: { id: true },
    })
    return owner?.id === viewerId ? viewerId : null
  }
  if (scope.albumId) {
    const album = await prisma.collection.findUnique({
      where: { id: scope.albumId },
      select: { userId: true },
    })
    return album?.userId === viewerId ? viewerId : null
  }
  return null
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params
  const photo = await prisma.photo.findUnique({
    where: { id },
    include: { user: { select: publicUserSelect }, camera: true, filmStock: true }
  })

  // Unpublished and private photos are reachable by direct URL for their owner,
  // so they get an explicit noindex rather than relying on the 404 path.
  if (!photo || !photo.published || photo.visibility !== 'PUBLIC') {
    return { title: 'Photo Not Found', robots: { index: false, follow: false } }
  }

  const title = photoTitle(photo)
  const description = photoDescription(photo)
  const photographer = photographerName(photo.user)

  const keywords = [
    displayName(photo.filmStock) && `${displayName(photo.filmStock)} sample photos`,
    displayName(photo.camera) && `${displayName(photo.camera)} sample photos`,
    displayName(photo.filmStock),
    displayName(photo.camera),
    'film photography',
    '35mm film',
  ].filter((k): k is string => !!k)

  return {
    title,
    description,
    keywords,
    openGraph: {
      title,
      description,
      type: 'article',
      url: `${SITE_URL}/photos/${id}`,
      images: [
        {
          url: photo.mediumPath,
          width: photo.width,
          height: photo.height,
          alt: photoAlt(photo),
        },
      ],
      ...(photographer && { authors: [photographer] }),
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [photo.mediumPath],
    },
    alternates: { canonical: `${SITE_URL}/photos/${id}` },
  }
}

export default async function PhotoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { id } = await params
  const query = await searchParams
  const session = await getServerSession(authOptions)
  const userId = session?.user ? (session.user as { id: string }).id : null

  const photo = await prisma.photo.findUnique({
    where: { id },
    include: {
      camera: true,
      filmStock: true,
      user: { select: publicUserSelect },
      _count: { select: { likes: true } }
    }
  })

  const userLiked = userId ? await prisma.like.findUnique({
    where: { userId_photoId: { userId, photoId: id } }
  }) : null

  // A private photo is its owner's alone: everyone else gets the same 404 they
  // would get for a photo that does not exist, rather than a 403 that confirms
  // one is there.
  if (!photo || !canViewPhoto(photo, userId)) notFound()

  // Prev/next follow the list you arrived from.
  //
  // They used to walk every published photo on the site by date, ignoring
  // context entirely — so stepping through your own private album landed you
  // on a stranger's photo. The grid passes the scope it was showing, and
  // ownership of a private scope is checked here rather than trusted.
  const navQuery = scopeParams(query)
  // Appended to every onward link. Without it the first step stayed in the
  // album and the one after it went back to walking the whole site, which read
  // as "next jumps to random photos".
  const navSuffix = navQuery ? `?${navQuery}` : ''
  const navScope = parseFeedScope(new URLSearchParams(navQuery))
  const scopeOwnerId = userId ? await resolveScopeOwner(navScope, userId) : null
  const navWhere = feedWhere('recent', [], navScope, scopeOwnerId)

  const [prevPhoto, nextPhoto] = await Promise.all([
    prisma.photo.findFirst({
      where: { ...navWhere, createdAt: { gt: photo.createdAt } },
      orderBy: { createdAt: 'asc' },
      select: { id: true }
    }),
    prisma.photo.findFirst({
      where: { ...navWhere, createdAt: { lt: photo.createdAt } },
      orderBy: { createdAt: 'desc' },
      select: { id: true }
    })
  ])

  const isOwner = userId === photo.userId

  // Named in the "remove from album" control, so it says which album.
  const navAlbumName =
    isOwner && navScope.albumId
      ? (
          await prisma.collection.findFirst({
            where: { id: navScope.albumId, userId: photo.userId },
            select: { name: true },
          })
        )?.name ?? null
      : null

  // Read from the row rather than issuing a HeadObject against object storage.
  // That call was blocking every render of the site's most-crawled page type and
  // cost roughly 700ms of TTFB purely to print one line in the details panel.
  // Photos uploaded before originalBytes existed show nothing until backfilled
  // (scripts/backfill-photo-sizes.ts).
  const fileSize = formatBytes(photo.originalBytes)

  const relatedPhotos = await prisma.photo.findMany({
    where: {
      id: { not: photo.id },
      ...PUBLIC_PHOTO,
      OR: [
        { filmStockId: photo.filmStockId },
        { cameraId: photo.cameraId }
      ].filter(c => Object.values(c)[0] !== null)
    },
    take: 4,
    orderBy: { createdAt: 'desc' },
    select: {
      id: true, thumbnailPath: true, blurHash: true, caption: true,
      filmStock: { select: { name: true, brand: true } },
      camera: { select: { name: true, brand: true } },
      user: { select: { name: true, username: true } },
    }
  })

  const filmName = displayName(photo.filmStock)

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex flex-col">
      <JsonLd
        data={[
          photoJsonLd({ ...photo, likeCount: photo._count.likes }),
          breadcrumbJsonLd([
            { name: 'Home', path: '/' },
            ...(photo.filmStock
              ? [{ name: 'Film Stocks', path: '/films' },
                 { name: filmName!, path: canonicalFilmPath(photo.filmStock) }]
              : [{ name: 'Explore', path: '/explore' }]),
            { name: photoTitle(photo), path: `/photos/${photo.id}` },
          ]),
        ]}
      />
      <Header />

      <main className="flex-1">
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-6 md:py-8">
          <div className="flex flex-col lg:flex-row gap-6 md:gap-8">
            {/* Left - Photo */}
            <div className="lg:flex-1">
              <div className="border border-neutral-800">
                {/* Portrait photos were sized purely off the viewport height
                    (width = ratio x 80vh) with nothing capping them to the
                    column, so on a phone every one of them ran off the side: a
                    2:3 frame came out 450px wide in a 390px window. Width is
                    the container now, with a max that stops the height passing
                    80vh, so it fits at any aspect ratio without overflowing. */}
                <div
                  className="relative bg-neutral-950 mx-auto w-full"
                  style={{
                    aspectRatio: `${photo.width} / ${photo.height}`,
                    maxWidth: `calc(80vh * ${photo.width} / ${photo.height})`,
                  }}
                >
                  <Image
                    src={photo.mediumPath}
                    alt={photoAlt(photo)}
                    fill
                    className="object-contain"
                    priority
                    placeholder={photo.blurHash ? 'blur' : 'empty'}
                    blurDataURL={blurHashToDataURL(photo.blurHash)}
                  />
                  <Lightbox
                    src={photo.originalPath}
                    alt={photoAlt(photo)}
                    prevId={prevPhoto?.id}
                    nextId={nextPhoto?.id}
                    navSuffix={navSuffix}
                    blurHash={photo.blurHash}
                  />
                </div>
                <div className="flex items-center justify-between px-4 py-3 border-t border-neutral-800 bg-neutral-900">
                  {prevPhoto ? (
                    <a href={`/photos/${prevPhoto.id}${navSuffix}`} className="flex items-center gap-2 text-neutral-400 hover:text-white text-sm transition-colors">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                      Previous
                    </a>
                  ) : <span />}
                  {nextPhoto ? (
                    <a href={`/photos/${nextPhoto.id}${navSuffix}`} className="flex items-center gap-2 text-neutral-400 hover:text-white text-sm transition-colors">
                      Next
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                    </a>
                  ) : <span />}
                </div>
              </div>

              {/* Camera and Film Cards Below Photo */}
              {(photo.camera || photo.filmStock) && (
                <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                  {photo.camera && (
                    <Link
                      href={canonicalCameraPath(photo.camera)}
                      className="group bg-neutral-900 border border-neutral-800 hover:border-[#D32F2F] transition-all p-4 flex items-center gap-4"
                    >
                      <div className="relative w-20 h-16 flex-shrink-0 flex items-center justify-center">
                        {photo.camera.imageUrl && photo.camera.imageStatus === 'approved' ? (
                          <Image
                            src={photo.camera.imageUrl}
                            alt={gearImageAlt(photo.camera, 'camera')}
                            fill
                            className="object-contain"
                          />
                        ) : (
                          <svg className="w-8 h-8 text-neutral-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                          </svg>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs text-neutral-500 mb-1 uppercase tracking-wide">Camera</div>
                        <div className="text-white font-semibold group-hover:text-[#D32F2F] transition-colors truncate">
                          {photo.camera.brand ? `${photo.camera.brand} ${photo.camera.name}` : photo.camera.name}
                        </div>
                      </div>
                      <svg className="w-5 h-5 text-neutral-600 group-hover:text-[#D32F2F] transition-colors flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </Link>
                  )}

                  {photo.filmStock && (
                    <Link
                      href={canonicalFilmPath(photo.filmStock)}
                      className="group bg-neutral-900 border border-neutral-800 hover:border-[#D32F2F] transition-all p-4 flex items-center gap-4"
                    >
                      <div className="relative w-20 h-16 flex-shrink-0 flex items-center justify-center">
                        {photo.filmStock.imageUrl && photo.filmStock.imageStatus === 'approved' ? (
                          <Image
                            src={photo.filmStock.imageUrl}
                            alt={gearImageAlt(photo.filmStock, 'film')}
                            fill
                            className="object-contain"
                          />
                        ) : (
                          <svg className="w-8 h-8 text-neutral-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
                          </svg>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs text-neutral-500 mb-1 uppercase tracking-wide">Film Stock</div>
                        <div className="text-white font-semibold group-hover:text-[#D32F2F] transition-colors truncate">
                          {photo.filmStock.brand ? `${photo.filmStock.brand} ${photo.filmStock.name}` : photo.filmStock.name}
                        </div>
                        {photo.filmStock.iso && (
                          <div className="text-xs text-neutral-500">ISO {photo.filmStock.iso}</div>
                        )}
                      </div>
                      <svg className="w-5 h-5 text-neutral-600 group-hover:text-[#D32F2F] transition-colors flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </Link>
                  )}
                </div>
              )}

            </div>

            {/* Right - Info Panel */}
            <div className="lg:w-80 space-y-6">
              {/* Author */}
              <Link href={`/${photo.user.username}`} className="flex items-center gap-4 group bg-neutral-900 border border-neutral-800 p-4 hover:border-[#D32F2F] transition-colors">
                <div className="w-14 h-14 bg-neutral-800 flex items-center justify-center text-white text-xl font-bold overflow-hidden flex-shrink-0">
                  {photo.user.avatar ? (
                    <Image src={photo.user.avatar} alt={`${photo.user.name || photo.user.username} profile photo`} width={56} height={56} className="w-full h-full object-cover" />
                  ) : (
                    (photo.user.name || photo.user.username).charAt(0).toUpperCase()
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-white font-semibold text-lg group-hover:text-[#D32F2F] transition-colors truncate">{photo.user.name || photo.user.username}</p>
                  <p className="text-neutral-500 text-sm truncate">@{photo.user.username}</p>
                </div>
                <svg className="w-5 h-5 text-neutral-600 group-hover:text-[#D32F2F] transition-colors flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </Link>

              {/* Caption */}
              {photo.caption && (
                <div className="bg-neutral-900 border border-neutral-800 p-4">
                  <p className="text-neutral-300 leading-relaxed">{photo.caption}</p>
                </div>
              )}

              {/* Details */}
              <div className="bg-neutral-900 border border-neutral-800 p-4 space-y-3">
                <div className="text-xs text-neutral-500 mb-3 uppercase tracking-wide">Details</div>

                {photo.takenDate && (
                  <div className="flex justify-between items-center">
                    <span className="text-neutral-500 text-sm">Taken</span>
                    <span className="text-white text-sm">
                      {new Date(photo.takenDate).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' })}
                    </span>
                  </div>
                )}

                <div className="flex justify-between items-center">
                  <span className="text-neutral-500 text-sm">Uploaded</span>
                  <span className="text-white text-sm">
                    {photo.createdAt.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
                  </span>
                </div>

                <div className="flex justify-between items-center">
                  <span className="text-neutral-500 text-sm">Resolution</span>
                  <span className="text-white text-sm">{photo.width} × {photo.height}</span>
                </div>

                {fileSize && (
                  <div className="flex justify-between items-center">
                    <span className="text-neutral-500 text-sm">Original Size</span>
                    <span className="text-white text-sm">{fileSize}</span>
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="bg-neutral-900 border border-neutral-800 p-4 space-y-3">
                <a
                  href={photo.originalPath}
                  target="_blank"
                  className="block w-full text-center py-2.5 border border-neutral-700 text-neutral-300 text-sm hover:bg-white hover:text-black transition-colors font-medium"
                >
                  View Original
                </a>

                <WatermarkButton
                  photoId={photo.id}
                  camera={photo.camera?.name}
                  filmStock={photo.filmStock?.name}
                  takenDate={photo.takenDate ? photo.takenDate.toISOString() : null}
                />

                <div className="flex items-center gap-4 pt-3 border-t border-neutral-800">
                  <LikeButton photoId={photo.id} initialLiked={!!userLiked} initialCount={photo._count.likes} />
                  {isOwner && (
                    <Link href={`/photos/${photo.id}/edit`} className="text-neutral-500 hover:text-white text-sm transition-colors font-medium">
                      Edit
                    </Link>
                  )}
                </div>

                {isOwner && (
                  <div className="pt-3 border-t border-neutral-800">
                    <OwnerControls
                      photoId={photo.id}
                      visibility={photo.visibility}
                      albumId={navScope.albumId}
                      albumName={navAlbumName ?? undefined}
                    />
                  </div>
                )}
              </div>

              {/* Comments */}
              <div className="bg-neutral-900 border border-neutral-800 p-4">
                <CommentSection photoId={photo.id} />
              </div>
            </div>
          </div>
        </div>

        {/* Related Photos */}
        {relatedPhotos.length > 0 && (
          <section className="border-t border-neutral-900 mt-8">
            <div className="max-w-7xl mx-auto px-4 md:px-6 py-12">
              <h2 className="text-lg font-bold text-white mb-6">More like this</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3">
                {relatedPhotos.map(p => (
                  <Link key={p.id} href={`/photos/${p.id}`} className="group relative aspect-[3/2] bg-neutral-900 overflow-hidden">
                    <Image
                      src={p.thumbnailPath}
                      alt={photoAlt(p)}
                      fill
                      className="object-cover group-hover:scale-105 transition-transform duration-300"
                      sizes="(max-width: 768px) 50vw, 25vw"
                      placeholder={p.blurHash ? 'blur' : 'empty'}
                      blurDataURL={blurHashToDataURL(p.blurHash)}
                    />
                  </Link>
                ))}
              </div>
            </div>
          </section>
        )}
      </main>

      <Footer />
    </div>
  )
}
