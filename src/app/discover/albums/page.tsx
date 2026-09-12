import { cache } from 'react'
import { prisma } from '@/lib/db'
import { previewPhotosByAlbum, groupPreviews, VISIBLE_TO_ANYONE } from '@/lib/previewPhotos'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import PageHeader from '@/components/ui/PageHeader'
import Link from 'next/link'
import Image from 'next/image'
import type { Metadata } from 'next'
import { blurPlaceholder, BLUR_SIZE, CARD_PREVIEW_BLUR_COUNT } from '@/lib/blurhash'
import { SITE_URL, OG_DEFAULT_IMAGE } from '@/lib/seo/site'
import { visiblePhotoCountsByAlbum } from '@/lib/counts'
import { parseIntParam } from '@/lib/validation'
import EmptyState, { PhotoIcon } from '@/components/ui/EmptyState'
import { ButtonLink } from '@/components/ui/Button'


export const dynamic = 'force-dynamic'

/**
 * Albums are written by users, so this list grows forever, unlike the film and
 * camera indexes whose catalogs are a fixed size. This page had no `take` at
 * all: every visit loaded every public album, then ran a window function over
 * every photo in all of them to pick the previews. Divides by the 1, 2 and 3
 * column grid below so the last row is never short.
 */
const ALBUMS_PER_PAGE = 24

/** The same ceiling the page applies, so the two cannot disagree. */
const MAX_PAGE = 100_000

/** Page one keeps the bare path, so the first page is not two URLs. */
function pageHref(page: number) {
  return page <= 1 ? '/discover/albums' : `/discover/albums?page=${page}`
}

/** One sentence for the description, the og card and the tweet card. */
const DESCRIPTION =
  'Browse public film photography albums from the AvoidXray community. Themed sets shot on 35mm and medium format.'

/**
 * The public album total, deduplicated per request.
 *
 * generateMetadata needs the last page to know when a `?page=` is past the
 * end, and the body needs it to draw the pager. Next runs both for every view
 * and dedupes `fetch()` but not a Prisma call, so asking separately would have
 * counted the table twice per visit — the same trick `loadPhoto` plays on the
 * photo page.
 */
const publicAlbumCount = cache(() => prisma.collection.count({ where: { public: true } }))

/** Both callers derive the end of the pager here, so they cannot disagree. */
function lastPageOf(totalAlbums: number) {
  return Math.max(1, Math.ceil(totalAlbums / ALBUMS_PER_PAGE))
}

/**
 * Each page canonicalizes to itself, not to page one.
 *
 * A fixed canonical told Google that every page past the first was a duplicate
 * of page one: it dropped them from the index and stopped following their
 * links, so with 120 albums the 96 reachable only from pages 2-5 lost their
 * one internal crawl path. `pageHref` already had the right URL for this.
 */
export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>
}): Promise<Metadata> {
  const { page: rawPage } = await searchParams
  const page = parseIntParam(rawPage ?? null, { fallback: 1, min: 1, max: MAX_PAGE })

  // Past the last page the grid is empty, and it used to canonicalize to
  // itself with no robots rule, so a crawler could count `?page=` upward and
  // mint thin pages without end. Those point back at page one and stay out of
  // the index; the body still prints its way back.
  const beyondEnd = page > lastPageOf(await publicAlbumCount())
  const url = `${SITE_URL}${pageHref(beyondEnd ? 1 : page)}`

  const title = page > 1 ? `Discover Albums, page ${page}` : 'Discover Albums'

  return {
    title,
    description: DESCRIPTION,
    // Without this the route inherited the root layout's openGraph whole, so
    // every share of page N posted a card for the homepage: its title, its
    // description and `og:url` pointing at `/`. The URL is the one the
    // canonical names, page number included.
    openGraph: {
      title: `${title} – AvoidXray`,
      description: DESCRIPTION,
      type: 'website',
      url,
      images: [OG_DEFAULT_IMAGE],
    },
    twitter: {
      card: 'summary_large_image',
      title: `${title} – AvoidXray`,
      description: DESCRIPTION,
    },
    alternates: { canonical: url },
    ...(beyondEnd ? { robots: { index: false, follow: false } } : {}),
  }
}

export default async function DiscoverAlbumsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>
}) {
  const { page: pageParam } = await searchParams
  const page = parseIntParam(pageParam ?? null, { fallback: 1, min: 1, max: MAX_PAGE })

  const [albums, totalAlbums] = await Promise.all([
    prisma.collection.findMany({
      where: { public: true },
      include: {
        user: { select: { id: true, username: true, name: true, avatar: true } }
      },
      // `id` breaks the tie for the same reason feedOrderBy does it: albums
      // created in the same import share a createdAt, and without a total
      // order Postgres may return them differently per query, which makes
      // offset paging drop some albums and repeat others.
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: (page - 1) * ALBUMS_PER_PAGE,
      take: ALBUMS_PER_PAGE
    }),
    publicAlbumCount()
  ])

  const lastPage = lastPageOf(totalAlbums)

  const albumIds = albums.map((a) => a.id)

  // A public album can still contain a private photo; the preview strangers
  // see must not include it, and drafts are excluded for the same reason. The
  // count is held to the same rule — a null viewer is the stranger's view — so
  // it matches the previews and the album page, and does not disclose how many
  // photos an album is holding back.
  const [previews, photoCounts] = await Promise.all([
    previewPhotosByAlbum({ albumIds, where: VISIBLE_TO_ANYONE }),
    visiblePhotoCountsByAlbum(albumIds, null)
  ])
  const photosByAlbum = groupPreviews(previews, 'collectionId')

  return (
    <div className="min-h-dvh bg-[#0a0a0a] flex flex-col">
      <Header />

      <main id="main-content" tabIndex={-1} className="flex-1 max-w-7xl mx-auto w-full py-10 md:py-16 px-6">
        <PageHeader
          title="Discover Albums"
          description="Photo collections put together by the community."
        />

        {albums.length === 0 ? (
          <EmptyState
            icon={
              <svg className="h-16 w-16" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
            }
            // A page number past the end is reachable by typing one, and by
            // following a link to a page that has since emptied out. Without
            // the way back it is a dead end with no albums and no pager.
            message={page > 1 ? 'No albums on this page' : 'No public albums yet'}
            action={page > 1 ? { href: pageHref(1), label: 'First page' } : undefined}
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {albums.map((album, cardIndex) => {
              const photos = photosByAlbum.get(album.id) || []
              return (
                <div key={album.id} className="group bg-neutral-900 border border-neutral-800 hover:border-brand transition-colors overflow-hidden">
                  <Link href={`/albums/${album.id}`}>
                    {/* Photo Grid */}
                    <div className="grid grid-cols-4 gap-px bg-neutral-800">
                      {photos.slice(0, 4).map((photo, previewIndex) => (
                        <div key={photo.id} className="aspect-square relative bg-neutral-900">
                          <Image
                            src={photo.thumbnailPath}
                            alt={`Film photograph from the album ${album.name}`}
                            fill
                            className="object-cover"
                            sizes="100px"
                            {...blurPlaceholder(
                              photo.blurHash,
                              cardIndex * 4 + previewIndex,
                              CARD_PREVIEW_BLUR_COUNT,
                              BLUR_SIZE.tile
                            )}
                          />
                        </div>
                      ))}
                      {Array.from({ length: Math.max(0, 4 - photos.length) }).map((_, i) => (
                        <div key={i} className="aspect-square bg-neutral-900 flex items-center justify-center text-neutral-700">
                          <PhotoIcon size={6} />
                        </div>
                      ))}
                    </div>
                    <div className="p-4 pb-2">
                      <h2 className="text-lg font-bold group-hover:text-brand transition-colors truncate">
                        {album.name}
                      </h2>
                      {album.description && (
                        <p className="text-neutral-500 text-sm truncate mt-1">{album.description}</p>
                      )}
                      <p className="text-neutral-500 text-sm mt-1">{photoCounts.get(album.id) ?? 0} photos</p>
                    </div>
                  </Link>
                  {album.user && (
                    <Link href={`/${album.user.username}`} className="flex items-center gap-2 px-4 pb-4 hover:opacity-80 transition-opacity">
                      {/* Square, like every other avatar on the site. */}
                      <div className="w-5 h-5 bg-neutral-800 flex items-center justify-center text-white text-xs font-bold overflow-hidden">
                        {album.user.avatar ? (
                          <Image src={album.user.avatar} alt={`${album.user.name || album.user.username} avatar`} width={20} height={20} className="w-full h-full object-cover" />
                        ) : (
                          (album.user.name || album.user.username).charAt(0).toUpperCase()
                        )}
                      </div>
                      <span className="text-neutral-400 text-sm hover:text-white transition-colors">@{album.user.username}</span>
                    </Link>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* Suppressed when the grid is empty: a page past the end would read
            "Page 7 of 3", and the empty state above already carries the way
            back. */}
        {albums.length > 0 && lastPage > 1 && (
          <nav className="flex items-center justify-between mt-8" aria-label="Pagination">
            <p className="text-xs text-neutral-600 tabular-nums">Page {page} of {lastPage}</p>
            <div className="flex gap-2">
              {page > 1 && (
                <ButtonLink href={pageHref(page - 1)} variant="outline" size="sm">Previous</ButtonLink>
              )}
              {page < lastPage && (
                <ButtonLink href={pageHref(page + 1)} variant="outline" size="sm">Next</ButtonLink>
              )}
            </div>
          </nav>
        )}
      </main>

      <Footer />
    </div>
  )
}
