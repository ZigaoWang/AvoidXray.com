import { cache } from 'react'
import { prisma } from '@/lib/db'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import MasonryGrid from '@/components/MasonryGrid'
import GearCard from '@/components/GearCard'
import JsonLd from '@/components/JsonLd'
import type { Metadata } from 'next'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { lookupFilm, lookupCamera, canonicalFilmPath } from '@/lib/seo/resolve'
import { breadcrumbJsonLd, collectionJsonLd } from '@/lib/seo/jsonld'
import { displayName, article } from '@/lib/seo/alt'
import { OG_DEFAULT_IMAGE, SITE_URL, comboUrl } from '@/lib/seo/site'
import { FEED_FIRST_PAGE, feedScopeQuery } from '@/lib/photoFeed'
import { PUBLIC_PHOTO } from '@/lib/photoVisibility'
import { hiddenPhotoFilter } from '@/lib/blocks'
import { withLikeCounts } from '@/lib/counts'
import { formatMonth } from '@/lib/formatDate'

/**
 * Film x camera combination page: /films/kodak-gold-200/shot-with/nikon-fm2
 *
 * This is the long-tail shape people actually search ("portra 400 on a canon
 * ae-1"), and it's the pattern Lomography leans on heavily. Pages only exist for
 * pairs that have real photos behind them; anything thinner 404s rather than
 * adding another near-empty URL to the index.
 *
 * It was built for the crawler and read like it: a heading, one generated
 * sentence and a grid, with nothing of either the film or the camera on it. A
 * page that exists because somebody searched for this pairing should answer
 * what they searched for, so it now shows both halves side by side with the
 * specifications that decide how the combination renders, who shot the frames
 * below, and where else to go next. Everything on it is drawn from records the
 * catalog already holds; none of it is written at the crawler.
 */

export const dynamic = 'force-dynamic'

/** Below this, the page has too little content to deserve indexing. */
const MIN_PHOTOS = 3

/** Sibling pairings offered at the foot of the page. */
const MAX_RELATED = 8

type Params = { params: Promise<{ id: string; camera: string }> }

/**
 * Cached for the same reason lookupFilm and lookupCamera are: generateMetadata
 * and the page both need this, and the MIN_PHOTOS count was a second aggregate
 * over Photo on every request for a number that cannot have changed in between.
 * Keyed on the two slugs rather than the params promise, which React compares by
 * identity and Next does not promise to hand both callers.
 */
const load = cache(async (id: string, cameraParam: string) => {
  const [film, camera] = await Promise.all([lookupFilm(id), lookupCamera(cameraParam)])
  if (!film || !camera) return null

  // Both halves need a slug to have a stable URL. Without this the canonical
  // and the structured data were built with non-null assertions and rendered a
  // literal "null" path segment for a record the slug backfill had not reached.
  // The two pages that link here already skip an unslugged pair.
  if (!film.slug || !camera.slug) return null

  const count = await prisma.photo.count({
    where: { ...PUBLIC_PHOTO, filmStockId: film.id, cameraId: camera.id },
  })
  if (count < MIN_PHOTOS) return null

  return { film, camera, count, path: comboUrl(film.slug, camera.slug) }
})

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id, camera: cameraParam } = await params
  const data = await load(id, cameraParam)
  // notFound() here as well as in the body, so the two agree — but see
  // films/[id]/page.tsx: with a loading.tsx on the route this is still a soft
  // 404, because the Suspense boundary flushes the shell before either call.
  if (!data) notFound()

  const { film, camera, count, path } = data
  const filmName = displayName(film) ?? film.name
  const cameraName = displayName(camera) ?? camera.name

  const title = `${filmName} shot on ${article(cameraName)} ${cameraName}`
  const description =
    `${count} sample photos of ${filmName} shot on ${article(cameraName)} ${cameraName}. See exactly how this ` +
    `film-and-camera combination renders color, grain, and contrast, from real scans uploaded by ` +
    `AvoidXray photographers, not marketing samples.`

  const canonical = `${SITE_URL}${path}`

  return {
    title,
    description,
    keywords: [
      `${filmName} ${cameraName}`,
      `${filmName} on ${cameraName}`,
      `${cameraName} ${filmName} sample photos`,
      `${filmName} sample photos`,
    ],
    openGraph: { title, description, type: 'website', url: canonical,
      images: [OG_DEFAULT_IMAGE],
    },
    twitter: { card: 'summary_large_image', title, description },
    alternates: { canonical },
  }
}

/** A row of sibling pairings, which is real navigation rather than a footer of links. */
function RelatedPairs({
  heading,
  items,
}: {
  heading: string
  items: Array<{ href: string; label: string; count: number }>
}) {
  if (items.length === 0) return null
  return (
    <section className="mb-10">
      <h2 className="mb-4 text-lg font-bold text-white">{heading}</h2>
      <div className="flex flex-wrap gap-2">
        {items.map(item => (
          <Link
            key={item.href}
            href={item.href}
            className="border border-neutral-800 px-3 py-1.5 text-sm text-neutral-300 transition-colors
                       hover:border-brand hover:text-white"
          >
            {item.label} <span className="text-neutral-600">({item.count})</span>
          </Link>
        ))}
      </div>
    </section>
  )
}

export default async function ComboPage({ params }: Params) {
  const { id, camera: cameraParam } = await params
  const data = await load(id, cameraParam)
  if (!data) notFound()

  const { film, camera, count, path } = data
  const session = await getServerSession(authOptions)
  const userId = (session?.user as { id?: string } | undefined)?.id

  // Blocked in either direction, matching what /api/photos applies to every
  // page after the first.
  const hidden = await hiddenPhotoFilter(userId)
  const scope = { ...PUBLIC_PHOTO, ...hidden, filmStockId: film.id, cameraId: camera.id }

  // load() runs without a session — it feeds generateMetadata and the
  // MIN_PHOTOS gate, so its count is the public total. Only recount when this
  // particular viewer actually hides somebody.
  const visibleCount =
    Object.keys(hidden).length === 0 ? count : await prisma.photo.count({ where: scope })

  const [photos, contributors, oldest, otherCameras, otherFilms] = await Promise.all([
    // Only the first screen; MasonryGrid pages the rest through /api/photos.
    prisma.photo.findMany({
      where: scope,
      take: FEED_FIRST_PAGE + 1,
      select: {
        id: true,
        thumbnailPath: true,
        mediumPath: true,
        width: true,
        height: true,
        blurHash: true,
        caption: true,
        takenDate: true,
        user: { select: { name: true, username: true } },
      },
      orderBy: { createdAt: 'desc' },
    }),
    // How many people, not which: the grid already credits each frame, and a
    // count is what says whether this is one person's roll or a consensus.
    prisma.photo.groupBy({ by: ['userId'], where: scope }),
    prisma.photo.findFirst({
      where: scope,
      orderBy: { createdAt: 'asc' },
      select: { createdAt: true },
    }),
    // The same pairing seen from the other side. These are the two questions
    // somebody on this page asks next, and both were dead ends before.
    prisma.photo.groupBy({
      by: ['cameraId'],
      where: { ...PUBLIC_PHOTO, ...hidden, filmStockId: film.id, cameraId: { not: camera.id } },
      _count: { _all: true },
      orderBy: { _count: { cameraId: 'desc' } },
      take: MAX_RELATED,
    }),
    prisma.photo.groupBy({
      by: ['filmStockId'],
      where: { ...PUBLIC_PHOTO, ...hidden, cameraId: camera.id, filmStockId: { not: film.id } },
      _count: { _all: true },
      orderBy: { _count: { filmStockId: 'desc' } },
      take: MAX_RELATED,
    }),
  ])

  // The extra row exists only to answer "is there another page"; nothing below
  // renders it, so it is dropped before anything else is asked about these ids.
  const hasMore = photos.length > FEED_FIRST_PAGE
  const pagePhotos = hasMore ? photos.slice(0, FEED_FIRST_PAGE) : photos

  const [relatedCameras, relatedFilms, userLikes, photosWithLikes] = await Promise.all([
    prisma.camera.findMany({
      where: { id: { in: otherCameras.map(c => c.cameraId!).filter(Boolean) } },
      select: { id: true, name: true, brand: true, slug: true },
    }),
    prisma.filmStock.findMany({
      where: { id: { in: otherFilms.map(f => f.filmStockId!).filter(Boolean) } },
      select: { id: true, name: true, brand: true, manufacturer: true, slug: true },
    }),
    userId && pagePhotos.length > 0
      ? prisma.like.findMany({
          where: { userId, photoId: { in: pagePhotos.map(p => p.id) } },
          select: { photoId: true },
        })
      : Promise.resolve([]),
    withLikeCounts(pagePhotos),
  ])

  const likedIds = new Set(userLikes.map(l => l.photoId))

  const filmName = displayName(film) ?? film.name
  const cameraName = displayName(camera) ?? camera.name

  const gridPhotos = photosWithLikes.map((p) => ({
    ...p,
    filmStock: { name: film.name, brand: film.brand },
    camera: { name: camera.name, brand: camera.brand },
    liked: likedIds.has(p.id),
  }))

  // A film stock's own record carries the maker; a camera's carries the brand.
  const cameraById = new Map(relatedCameras.map(c => [c.id, c]))
  const filmById = new Map(relatedFilms.map(f => [f.id, f]))

  const otherCameraLinks = otherCameras
    .map(row => {
      const c = row.cameraId ? cameraById.get(row.cameraId) : null
      if (!c?.slug || !film.slug) return null
      return { href: comboUrl(film.slug, c.slug), label: displayName(c) ?? c.name, count: row._count._all }
    })
    .filter((x): x is { href: string; label: string; count: number } => x !== null)

  const otherFilmLinks = otherFilms
    .map(row => {
      const f = row.filmStockId ? filmById.get(row.filmStockId) : null
      if (!f?.slug || !camera.slug) return null
      return { href: comboUrl(f.slug, camera.slug), label: displayName(f) ?? f.name, count: row._count._all }
    })
    .filter((x): x is { href: string; label: string; count: number } => x !== null)

  const photographerCount = contributors.length

  return (
    <div className="min-h-dvh bg-[#0a0a0a] flex flex-col">
      <JsonLd
        data={[
          breadcrumbJsonLd([
            { name: 'Home', path: '/' },
            { name: 'Film Stocks', path: '/films' },
            { name: filmName, path: canonicalFilmPath(film) },
            { name: `Shot with ${cameraName}`, path },
          ]),
          collectionJsonLd({
            name: `${filmName} shot on ${article(cameraName)} ${cameraName}`,
            description: `${count} film photographs shot on ${filmName} with ${article(cameraName)} ${cameraName}.`,
            path,
            photos: gridPhotos,
            totalPhotos: count,
          }),
        ]}
      />
      <Header />

      <main id="main-content" tabIndex={-1} className="flex-1 max-w-7xl mx-auto w-full py-8 md:py-16 px-4 md:px-6">
        <nav aria-label="Breadcrumb" className="text-sm mb-6">
          <ol className="flex flex-wrap items-center gap-2 text-neutral-500">
            <li><Link href="/" className="hover:text-white">Home</Link></li>
            <li aria-hidden>/</li>
            <li><Link href="/films" className="hover:text-white">Film Stocks</Link></li>
            <li aria-hidden>/</li>
            <li><Link href={canonicalFilmPath(film)} className="hover:text-white">{filmName}</Link></li>
            <li aria-hidden>/</li>
            {/* The relationship, not the camera. A trail ending in "Canon
                Autoboy S" under "Kodak UltraMax 400" reads as the camera being
                a kind of the film, which is what the URL's shape implies and
                the page does not mean. The structured data always said "Shot
                with"; only the visible trail had dropped it. */}
            <li aria-current="page" className="text-neutral-300">Shot with {article(cameraName)} {cameraName}</li>
          </ol>
        </nav>

        <header className="mb-8">
          <h1 className="mb-3 text-3xl font-black tracking-tight text-white md:text-4xl">
            {filmName} shot on {article(cameraName)} {cameraName}
          </h1>
          <p className="max-w-3xl leading-relaxed text-neutral-400">
            {visibleCount} {visibleCount === 1 ? 'photograph' : 'photographs'} from{' '}
            {photographerCount === 1 ? 'one photographer' : `${photographerCount} photographers`}
            {oldest ? `, the earliest posted ${formatMonth(oldest.createdAt)}` : ''}. Scans as they were
            uploaded, not manufacturer samples.
          </p>
        </header>

        {/* The same card the photo page uses for the same two things. Both
            halves are shown because the pairing belongs to neither of them. */}
        <div className="mb-10 grid gap-4 md:grid-cols-2">
          <GearCard kind="film" gear={film} />
          <GearCard kind="camera" gear={camera} />
        </div>

        <div>
          <div className="mb-6 flex items-center justify-between">
            <h2 className="text-2xl font-bold text-white">Photos</h2>
            <span className="text-sm text-neutral-500">
              {visibleCount} {visibleCount === 1 ? 'photo' : 'photos'}
            </span>
          </div>

          <MasonryGrid
            initialPhotos={gridPhotos}
            initialOffset={hasMore ? FEED_FIRST_PAGE : null}
            tab="recent"
            scopeQuery={feedScopeQuery({ filmStockId: film.id, cameraId: camera.id })}
          />
        </div>

        <div className="mt-12">
          <RelatedPairs heading={`${filmName} on other cameras`} items={otherCameraLinks} />
          <RelatedPairs heading={`Other film in the ${camera.name}`} items={otherFilmLinks} />
        </div>
      </main>

      <Footer />
    </div>
  )
}
