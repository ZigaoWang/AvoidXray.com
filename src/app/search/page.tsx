import { prisma } from '@/lib/db'
import ManufacturerValue from '@/components/ManufacturerValue'
import { searchCatalog } from '@/lib/catalogSearch'
import { Prisma } from '@prisma/client'
import Image from 'next/image'
import Link from 'next/link'
import Header from '@/components/Header'
import Footer from '@/components/Footer'

import type { Metadata } from 'next'
import { SITE_URL } from '@/lib/seo/site'
import { canonicalCameraPath, canonicalFilmPath } from '@/lib/seo/resolve'
import { PUBLIC_PHOTO } from '@/lib/photoVisibility'
import {
  previewPhotosByGear,
  groupPreviews,
  VISIBLE_TO_ANYONE,
  notHidden,
  PREVIEW_PHOTOS,
} from '@/lib/previewPhotos'
import { hiddenFilter, hiddenUserIds } from '@/lib/blocks'
import { photoCountsByCamera, photoCountsByFilmStock } from '@/lib/counts'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { displayName } from '@/lib/seo/alt'
import EmptyState from '@/components/ui/EmptyState'
export const metadata: Metadata = {
  title: 'Search',
  robots: { index: false, follow: false },
  alternates: { canonical: `${SITE_URL}/search` },
}

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string; type?: string; film?: string; camera?: string; sort?: string }> }) {
  const { q = '', type = 'all', film, camera, sort = 'recent' } = await searchParams

  if (!q) {
    return (
      <div className="min-h-dvh bg-[#0a0a0a] flex flex-col">
        <Header />
        <main id="main-content" tabIndex={-1} className="flex-1 flex items-center justify-center">
          <p className="text-neutral-500">Enter a search term</p>
        </main>
        <Footer />
      </div>
    )
  }

  const query = q.toLowerCase().trim()

  const session = await getServerSession(authOptions)
  const viewerId = (session?.user as { id?: string } | undefined)?.id ?? null
  const hiddenIds = await hiddenUserIds(viewerId)
  const hidden = hiddenFilter(hiddenIds)

  /**
   * What this viewer may see, for the photo previews and counts hanging off a
   * camera or film result.
   *
   * Those relations were loaded with no filter at all, so a search result could
   * preview a private or still-unpublished frame, and every count included
   * them — which also disclosed how many private photos a stock had.
   */
  const photoScope: Prisma.PhotoWhereInput = { ...PUBLIC_PHOTO, ...hidden }

  // Regular search with case-insensitive contains using mode: 'insensitive'
  const photoWhere: Prisma.PhotoWhereInput = {
    ...PUBLIC_PHOTO,
    ...hidden,
    caption: { contains: query, mode: 'insensitive' },
  }
  if (film) photoWhere.filmStockId = film
  if (camera) photoWhere.cameraId = camera

  const photoOrderBy: Prisma.PhotoOrderByWithRelationInput = sort === 'popular'
    ? { likes: { _count: 'desc' } }
    : { createdAt: 'desc' }

  // Alternate names have to be resolved before the film query, so it can
  // filter on the ids they matched.
  const [filmMatches, cameraMatches] = await Promise.all([
    searchCatalog('film', query, 50),
    searchCatalog('camera', query, 50),
  ])
  const filmIds = filmMatches.map((m) => m.id)
  const aliasByFilmId = new Map(filmMatches.map((m) => [m.id, m.matchedAlias]))
  const cameraIds = cameraMatches.map((m) => m.id)
  const aliasByCameraId = new Map(cameraMatches.map((m) => [m.id, m.matchedAlias]))

  const [photos, users, cameras, films] = await Promise.all([
    type === 'all' || type === 'photos' ? prisma.photo.findMany({
      where: photoWhere,
      // The tiles below render a thumbnail, a link and the caption as alt
      // text. They never touched the photographer, the film, the camera or
      // the like count, all four of which were being fetched in full.
      select: { id: true, thumbnailPath: true, caption: true },
      orderBy: photoOrderBy,
      take: 50
    }) : [],
    type === 'all' || type === 'users' ? prisma.user.findMany({
      where: {
        AND: [
          {
            OR: [
              { username: { contains: query, mode: 'insensitive' } },
              { name: { contains: query, mode: 'insensitive' } }
            ]
          },
          // A blocked account should not be findable by the person who blocked
          // them, in either direction.
          ...(hiddenIds.length > 0 ? [{ id: { notIn: hiddenIds } }] : []),
        ],
      },
      include: { _count: { select: { photos: { where: PUBLIC_PHOTO } } } },
      take: 50
    }) : [],
    type === 'all' || type === 'cameras' ? prisma.camera.findMany({
      // Matched by id, like film stocks, so alternate names and the brand
      // relation both count. This page and the type-ahead ran different
      // queries, so a body findable in one was missing from the other.
      where: { id: { in: cameraIds } },
      orderBy: { name: 'asc' },
      take: 50
    }) : [],
    type === 'all' || type === 'films' ? prisma.filmStock.findMany({
      // Matched by id, so alternate names count: "5219" has to find Vision3
      // 500T even though the query appears nowhere in its name.
      where: { id: { in: filmIds } },
      include: {
        // Both sides of the manufacturer question, so a result says who
        // actually makes it in the same words the film page uses.
        brandRef: { select: { name: true } },
        manufacturedBy: { select: { name: true } },
      },
      orderBy: { name: 'asc' },
      take: 50
    }) : []
    ])

  // The preview strips, picked in SQL now that the results are known. Asking
  // Prisma for four photos per result fetched *every* photo of all hundred
  // matched cameras and film stocks and kept four of each, so searching a
  // common word was the most expensive page on the site.
  // The photo counts ride along here, for the same reason and off the same
  // ids: a `_count` on the queries above aggregates the whole Photo table to
  // label at most fifty cards.
  const [cameraPreviews, filmPreviews, cameraPhotoCounts, filmPhotoCounts] = await Promise.all([
    previewPhotosByGear({
      key: 'cameraId',
      parents: cameras.map((c) => c.id),
      where: Prisma.sql`${VISIBLE_TO_ANYONE} ${notHidden(hiddenIds)}`,
      order: 'recent',
    }),
    previewPhotosByGear({
      key: 'filmStockId',
      parents: films.map((f) => f.id),
      where: Prisma.sql`${VISIBLE_TO_ANYONE} ${notHidden(hiddenIds)}`,
      order: 'recent',
    }),
    photoCountsByCamera(cameras.map((c) => c.id), photoScope),
    photoCountsByFilmStock(films.map((f) => f.id), photoScope),
  ])
  const photosByCamera = groupPreviews(cameraPreviews, 'cameraId')
  const photosByFilm = groupPreviews(filmPreviews, 'filmStockId')

  const tabs = [
    { id: 'all', label: 'All' },
    { id: 'photos', label: `Photos (${photos.length})` },
    { id: 'users', label: `Users (${users.length})` },
    { id: 'cameras', label: `Cameras (${cameras.length})` },
    { id: 'films', label: `Films (${films.length})` }
  ]

  return (
    <div className="min-h-dvh bg-[#0a0a0a] flex flex-col">
      <Header />

      <main id="main-content" tabIndex={-1} className="flex-1 max-w-7xl mx-auto w-full py-8 md:py-16 px-4 md:px-6">
        <h1 className="text-3xl md:text-4xl font-black text-white mb-2 tracking-tight">Search Results</h1>
        <p className="text-neutral-500 mb-8">Results for &ldquo;{q}&rdquo;</p>

        {/* aria-current, and a transparent border on the inactive tabs, as on
            Explore. Nothing carried which result type you were on except a red
            underline, and only the active tab had a border, so the labels
            shifted by 2px whenever the selection moved. */}
        {/* px-2 on the tabs, and the gap tightened to pay for it. Without any
            horizontal padding a tab was exactly as wide as its label, so "All"
            was a 17px target, under the 24px WCAG 2.5.8 minimum. It also gives
            the active underline something to span. */}
        <nav aria-label="Result types" className="flex gap-1 border-b border-neutral-800 mb-8 overflow-x-auto">
          {tabs.map(tab => (
            <Link
              key={tab.id}
              href={`/search?q=${encodeURIComponent(q)}&type=${tab.id}`}
              aria-current={type === tab.id ? 'page' : undefined}
              className={`px-2 py-3 text-sm font-medium transition-colors whitespace-nowrap border-b-2 ${
                type === tab.id
                  ? 'text-white border-brand'
                  : 'text-neutral-500 hover:text-white border-transparent'
              }`}
            >
              {tab.label}
            </Link>
          ))}
        </nav>

        {/* Photos */}
        {(type === 'all' || type === 'photos') && photos.length > 0 && (
          <section className="mb-10">
            <h2 className={type === 'all' ? 'text-xl font-bold text-white mb-6' : 'sr-only'}>Photos</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 md:gap-3">
              {photos.map(photo => (
                <Link key={photo.id} href={`/photos/${photo.id}`} className="relative aspect-[3/2] bg-neutral-900 group overflow-hidden">
                  <Image src={photo.thumbnailPath} alt={photo.caption || ''} fill className="object-cover group-hover:scale-105 transition-transform duration-300" sizes="(max-width: 768px) 50vw, (max-width: 1024px) 33vw, 25vw" />
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* Users */}
        {(type === 'all' || type === 'users') && users.length > 0 && (
          <section className="mb-10">
            <h2 className={type === 'all' ? 'text-xl font-bold text-white mb-6' : 'sr-only'}>Users</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {users.map(user => (
                <Link key={user.id} href={`/${user.username}`} className="flex items-center gap-4 p-4 bg-neutral-900 border border-neutral-800 hover:border-brand transition-colors">
                  <div className="w-12 h-12 bg-neutral-800 flex items-center justify-center text-white font-bold overflow-hidden shrink-0">
                    {user.avatar ? <Image src={user.avatar} alt="" width={48} height={48} className="w-full h-full object-cover" /> : (user.name || user.username).charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-white font-semibold truncate">{user.name || user.username}</p>
                    <p className="text-neutral-500 text-sm">@{user.username} · {user._count.photos} photos</p>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* Cameras */}
        {(type === 'all' || type === 'cameras') && cameras.length > 0 && (
          <section className="mb-10">
            <h2 className={type === 'all' ? 'text-xl font-bold text-white mb-6' : 'sr-only'}>Cameras</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {cameras.map(camera => {
                const displayImage = camera.imageStatus === 'approved' ? camera.imageUrl : null
                const previews = photosByCamera.get(camera.id) ?? []
                return (
                  <Link
                    key={camera.id}
                    href={canonicalCameraPath(camera)}
                    className="group bg-neutral-900 border border-neutral-800 hover:border-brand transition-colors overflow-hidden"
                  >
                    {/* Photo Grid */}
                    <div className="grid grid-cols-4 gap-px bg-neutral-800">
                      {previews.map((photo) => (
                        <div key={photo.id} className="aspect-square relative bg-neutral-900">
                          <Image src={photo.thumbnailPath} alt="" fill className="object-cover" sizes="100px" />
                        </div>
                      ))}
                      {Array.from({ length: Math.max(0, PREVIEW_PHOTOS - previews.length) }).map((_, i) => (
                        <div key={i} className="aspect-square bg-neutral-900" />
                      ))}
                    </div>

                    {/* Info Section */}
                    <div className="p-4 flex items-center gap-4">
                      <div className="relative w-32 h-24 flex-shrink-0">
                        {displayImage ? (
                          <Image
                            src={displayImage}
                            alt=""
                            fill
                            className="object-contain"
                          sizes="128px" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-neutral-800">
                            <svg
                              className="w-12 h-12 text-neutral-600"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
                              />
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"
                              />
                            </svg>
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="text-lg font-bold group-hover:text-brand transition-colors truncate">
                          {displayName(camera) ?? camera.name}
                        </h3>
                        <p className="text-neutral-500">{cameraPhotoCounts.get(camera.id) ?? 0} photos</p>
                        {/* Why this came back for a query its name does not
                            contain, e.g. "Stylus" finding the Mju. */}
                        {aliasByCameraId.get(camera.id) && (
                          <p className="mt-1 text-xs text-neutral-600 truncate">
                            Also known as{' '}
                            <span className="text-neutral-400">{aliasByCameraId.get(camera.id)}</span>
                          </p>
                        )}
                      </div>
                    </div>
                  </Link>
                )
              })}
            </div>
          </section>
        )}

        {/* Films */}
        {(type === 'all' || type === 'films') && films.length > 0 && (
          <section className="mb-10">
            <h2 className={type === 'all' ? 'text-xl font-bold text-white mb-6' : 'sr-only'}>Films</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {films.map(film => {
                const displayImage = film.imageStatus === 'approved' ? film.imageUrl : null
                const previews = photosByFilm.get(film.id) ?? []
                return (
                  <Link
                    key={film.id}
                    href={canonicalFilmPath(film)}
                    className="group bg-neutral-900 border border-neutral-800 hover:border-brand transition-colors overflow-hidden"
                  >
                    {/* Photo Grid */}
                    <div className="grid grid-cols-4 gap-px bg-neutral-800">
                      {previews.map((photo) => (
                        <div key={photo.id} className="aspect-square relative bg-neutral-900">
                          <Image src={photo.thumbnailPath} alt="" fill className="object-cover" sizes="100px" />
                        </div>
                      ))}
                      {Array.from({ length: Math.max(0, PREVIEW_PHOTOS - previews.length) }).map((_, i) => (
                        <div key={i} className="aspect-square bg-neutral-900" />
                      ))}
                    </div>

                    {/* Info Section */}
                    <div className="p-4 flex items-center gap-4">
                      <div className="relative w-32 h-24 flex-shrink-0">
                        {displayImage ? (
                          <Image
                            src={displayImage}
                            alt=""
                            fill
                            className="object-contain"
                          sizes="128px" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-neutral-800">
                            <svg
                              className="w-12 h-12 text-neutral-600"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01"
                              />
                            </svg>
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="text-lg font-bold group-hover:text-brand transition-colors truncate">
                          {displayName(film) ?? film.name}
                        </h3>
                        <div className="flex items-center gap-2 text-neutral-500">
                          {film.iso && <span>ISO {film.iso}</span>}
                          {film.iso && <span>•</span>}
                          <span>{filmPhotoCounts.get(film.id) ?? 0} photos</span>
                          <span>•</span>
                          <ManufacturerValue
                            size="small"
                            status={film.manufacturerStatus}
                            brandName={film.brandRef.name}
                            manufacturerName={film.manufacturedBy?.name}
                          />
                        </div>
                        {/* Why this came back for a query its name does not
                            contain — e.g. "5219" finding Vision3 500T. */}
                        {aliasByFilmId.get(film.id) && (
                          <p className="mt-1 text-xs text-neutral-600 truncate">
                            Also known as{' '}
                            <span className="text-neutral-400">{aliasByFilmId.get(film.id)}</span>
                          </p>
                        )}
                      </div>
                    </div>
                  </Link>
                )
              })}
            </div>
          </section>
        )}

        {photos.length === 0 && users.length === 0 && cameras.length === 0 && films.length === 0 && (
          <EmptyState
            icon={
              <svg className="h-16 w-16" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            }
            message="No results found"
            hint="Try a different search term"
          />
        )}
      </main>

      <Footer />
    </div>
  )
}
