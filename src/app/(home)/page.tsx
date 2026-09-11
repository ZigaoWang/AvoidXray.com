import Link from 'next/link'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import { sectionHeadingClass } from '@/components/ui/PageHeader'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import HeroSection from '@/components/HeroSection'
import MasonryGrid from '@/components/MasonryGrid'
import { GearBrowseCard } from '@/components/GearCard'
import type { MasonryItem } from '@/components/HeroMasonry'
import type { Metadata } from 'next'
import { OG_DEFAULT_IMAGE, SITE_URL } from '@/lib/seo/site'
import { PUBLIC_PHOTO } from '@/lib/photoVisibility'
import { hiddenUserIds, hiddenFilter } from '@/lib/blocks'
import { withLikeCounts } from '@/lib/counts'
import { previewPhotosByGear, groupPreviews, VISIBLE_TO_ANYONE, notHidden } from '@/lib/previewPhotos'
import { canonicalFilmPath, canonicalCameraPath } from '@/lib/seo/resolve'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  // Absolute, or the root layout's "%s – AvoidXray" template appends the brand
  // to a title that already ends in it: "AvoidXray – Film Photography
  // Community – AvoidXray". The template is right for every other page and
  // wrong for the one whose title is the site's own name.
  title: { absolute: 'AvoidXray – Film Photography Community' },
  description:
    'Browse real film photography organized by film stock and camera. See how Kodak, Fujifilm, Ilford and Cinestill stocks actually render before you buy a roll. Every frame is an unedited scan uploaded by the photographer who shot it.',
  keywords: [
    'film photography',
    'film stock sample photos',
    '35mm film samples',
    'film camera sample photos',
    'analog photography community',
    'shot on film',
  ],
  alternates: { canonical: SITE_URL },
  openGraph: {
    title: 'AvoidXray – Film Photography Community',
    description:
      'Real film photography organized by film stock and camera. See how a stock actually renders before you buy a roll.',
    url: SITE_URL,
    type: 'website',
      images: [OG_DEFAULT_IMAGE],
    },
}

/**
 * How many photos the hero shows, and how deep a pool it shuffles them out of.
 *
 * The pool exists so the collage differs between visits without the page
 * having to load the whole archive to do it. Four hundred is wide enough that
 * repeat visits rarely repeat a layout, and bounded so the query cost stops
 * tracking the size of the gallery.
 */
const HERO_PHOTOS = 100
const HERO_PHOTO_POOL = 400

/**
 * Gear tiles are mixed in one per five photos, so the hero shows at most
 * HERO_GEAR of each. The pool is wider than that for the same reason as the
 * photo pool: shuffling a list the same size as the slice is not a shuffle.
 */
const HERO_GEAR = 20
const HERO_GEAR_POOL = 80

/**
 * What the page shows below the hero.
 *
 * The front page used to be exactly one screen: a dimmed collage with the
 * wordmark over it, and the first scroll reached the footer. Nothing on it was
 * clickable except two buttons, and the collage — the only evidence of what the
 * site holds — is decorative, so the instinct everyone has on seeing a wall of
 * photographs did nothing.
 *
 * Twelve frames, then three stocks and three bodies. Enough to show what an
 * archive filed by gear looks like, and short enough that the page still ends.
 */
const LATEST_FRAMES = 12
const GEAR_CARDS = 3

// Fisher-Yates shuffle
function shuffle<T>(array: T[]): T[] {
  const shuffled = [...array]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }
  return shuffled
}

/**
 * One band below the hero: a heading, a line about it, and a way in.
 *
 * The three of them share this rather than each setting their own heading size
 * and padding, which is how six index pages on this site ended up opening at
 * four different title sizes.
 */
function HomeSection({
  title,
  link,
  children,
}: {
  title: string
  link: { href: string; label: string }
  children: React.ReactNode
}) {
  return (
    <section className="mx-auto w-full max-w-7xl px-6 py-14 border-t border-neutral-900">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        {/* The heading and a way in, and nothing else. Each of these had a
            line of explanatory copy under it; the heading already says what
            the band is. */}
        <h2 className={sectionHeadingClass}>{title}</h2>
        <Link
          href={link.href}
          className="text-sm font-medium text-neutral-400 underline-offset-4 transition-colors hover:text-white hover:underline"
        >
          {link.label} →
        </Link>
      </div>
      {children}
    </section>
  )
}

export default async function Home() {
  const session = await getServerSession(authOptions)
  const viewerId = (session?.user as { id?: string } | undefined)?.id
  // The block rule, both ways. Free for a signed-out visitor, which is most of
  // them: hiddenUserIds answers [] without a query when there is no session.
  const hidden = await hiddenUserIds(viewerId)
  const visible = { ...PUBLIC_PHOTO, ...hiddenFilter(hidden) }

  const [
    photoPool,
    totalPhotos,
    totalFilms,
    totalCameras,
    filmStocks,
    cameras,
    latestFrames,
    topFilmRows,
    topCameraRows,
  ] = await Promise.all([
    prisma.photo.findMany({
      where: { ...PUBLIC_PHOTO },
      // Geometry and the image, and nothing else. The collage is decorative —
      // the grid is aria-hidden and every tile's alt is empty — so the caption
      // and the three joins that fed the old alt text now describe nothing:
      // four hundred rows were each paying for a film stock, a camera and a
      // user to render a thumbnail nobody is told about. Giving the tiles
      // words again means bringing these back.
      select: { id: true, thumbnailPath: true, width: true, height: true, blurHash: true },
      // Bounded. This had no `take` at all, so every visit to the homepage
      // loaded every public photo — with three joins each — to shuffle them
      // and keep the first hundred. That cost grew with every upload forever.
      orderBy: { createdAt: 'desc' },
      take: HERO_PHOTO_POOL,
    }),
    prisma.photo.count({ where: { ...PUBLIC_PHOTO } }),
    // Counted, not derived from the lists below. Those are filtered to gear
    // that has an approved image, so using their length told the reader there
    // were fewer film stocks and cameras on the site than there really are —
    // and disagreed with the count on the social card.
    prisma.filmStock.count(),
    prisma.camera.count(),
    prisma.filmStock.findMany({
      where: { imageStatus: 'approved', imageUrl: { not: null } },
      select: { id: true, slug: true, name: true, brand: true, imageUrl: true },
      take: HERO_GEAR_POOL,
    }),
    prisma.camera.findMany({
      where: { imageStatus: 'approved', imageUrl: { not: null } },
      select: { id: true, slug: true, name: true, brand: true, imageUrl: true },
      take: HERO_GEAR_POOL,
    }),

    // The columns the feed's tiles draw: the geometry, and what the label and
    // the alt text are built from.
    prisma.photo.findMany({
      where: visible,
      orderBy: { createdAt: 'desc' },
      take: LATEST_FRAMES,
      select: {
        id: true,
        thumbnailPath: true,
        mediumPath: true,
        width: true,
        height: true,
        blurHash: true,
        caption: true,
        filmStock: { select: { name: true, brand: true, manufacturer: true } },
        camera: { select: { name: true, brand: true } },
        user: { select: { name: true, username: true } },
      },
    }),

    // What people here have actually shot, rather than the front of the
    // alphabet. Both are served by Photo's @@index([published, filmStockId])
    // and its camera twin.
    prisma.photo.groupBy({
      by: ['filmStockId'],
      where: { ...visible, filmStockId: { not: null } },
      _count: { _all: true },
      orderBy: { _count: { filmStockId: 'desc' } },
      take: GEAR_CARDS,
    }),
    prisma.photo.groupBy({
      by: ['cameraId'],
      where: { ...visible, cameraId: { not: null } },
      _count: { _all: true },
      orderBy: { _count: { cameraId: 'desc' } },
      take: GEAR_CARDS,
    }),
  ])

  // The groupBy answers which gear, not what it is called, so the rows are
  // resolved here — along with the four sample frames each card shows and the
  // like state of the twelve photographs above them.
  const topFilmIds = topFilmRows.map(row => row.filmStockId).filter((id): id is string => !!id)
  const topCameraIds = topCameraRows.map(row => row.cameraId).filter((id): id is string => !!id)
  const previewWhere = Prisma.sql`${VISIBLE_TO_ANYONE} ${notHidden(hidden)}`

  const [framesWithLikes, viewerLikes, topFilmStocks, topCameras, filmPreviews, cameraPreviews] =
    await Promise.all([
      withLikeCounts(latestFrames),
      viewerId
        ? prisma.like.findMany({
            where: { userId: viewerId, photoId: { in: latestFrames.map(p => p.id) } },
            select: { photoId: true },
          })
        : [],
      prisma.filmStock.findMany({
        where: { id: { in: topFilmIds } },
        select: {
          id: true, slug: true, name: true, brand: true, manufacturer: true,
          iso: true, imageUrl: true, imageStatus: true,
        },
      }),
      prisma.camera.findMany({
        where: { id: { in: topCameraIds } },
        select: {
          id: true, slug: true, name: true, brand: true, imageUrl: true, imageStatus: true,
        },
      }),
      previewPhotosByGear({ key: 'filmStockId', parents: topFilmIds, where: previewWhere, order: 'random' }),
      previewPhotosByGear({ key: 'cameraId', parents: topCameraIds, where: previewWhere, order: 'random' }),
    ])

  const likedIds = new Set(viewerLikes.map(like => like.photoId))
  const latestPhotos = framesWithLikes.map(photo => ({ ...photo, liked: likedIds.has(photo.id) }))

  const filmPreviewsById = groupPreviews(filmPreviews, 'filmStockId')
  const cameraPreviewsById = groupPreviews(cameraPreviews, 'cameraId')

  // Kept in the order the counts came back in, which findMany does not preserve.
  const filmCards = topFilmRows.flatMap(row => {
    const gear = topFilmStocks.find(stock => stock.id === row.filmStockId)
    return gear ? [{ gear, count: row._count._all }] : []
  })
  const cameraCards = topCameraRows.flatMap(row => {
    const gear = topCameras.find(camera => camera.id === row.cameraId)
    return gear ? [{ gear, count: row._count._all }] : []
  })

  // Shuffle everything - get MORE items for impressive density
  const shuffledPhotos = shuffle(photoPool).slice(0, HERO_PHOTOS).map(p => ({ ...p, type: 'photo' as const }))
  const shuffledFilms = shuffle(filmStocks).slice(0, HERO_GEAR).map(f => ({ ...f, type: 'film' as const }))
  const shuffledCameras = shuffle(cameras).slice(0, HERO_GEAR).map(c => ({ ...c, type: 'camera' as const }))

  // Mix them together - alternate film and camera, spread evenly
  const mixedItems: MasonryItem[] = []
  let filmIndex = 0
  let cameraIndex = 0
  let useFilm = true // alternate between film and camera

  shuffledPhotos.forEach((photo, i) => {
    mixedItems.push(photo)
    // Insert film or camera every 5 photos, alternating
    if ((i + 1) % 5 === 0) {
      if (useFilm && filmIndex < shuffledFilms.length) {
        mixedItems.push(shuffledFilms[filmIndex])
        filmIndex++
      } else if (!useFilm && cameraIndex < shuffledCameras.length) {
        mixedItems.push(shuffledCameras[cameraIndex])
        cameraIndex++
      } else if (filmIndex < shuffledFilms.length) {
        mixedItems.push(shuffledFilms[filmIndex])
        filmIndex++
      } else if (cameraIndex < shuffledCameras.length) {
        mixedItems.push(shuffledCameras[cameraIndex])
        cameraIndex++
      }
      useFilm = !useFilm
    }
  })

  return (
    <div className="min-h-dvh bg-[#0a0a0a] flex flex-col">
      <Header />

      {/* The front page was the one page with no main landmark at all, so it
          had nothing for "Skip to content" to reach and nothing for a screen
          reader to jump to. */}
      <main id="main-content" tabIndex={-1} className="flex-1 outline-none">
        <HeroSection
          items={mixedItems}
          totalPhotos={totalPhotos}
          totalFilms={totalFilms}
          totalCameras={totalCameras}
          isLoggedIn={!!session}
        />

        {latestPhotos.length > 0 && (
          <HomeSection
            title="Latest frames"
            link={{ href: '/explore', label: 'See all photos' }}
          >
            <MasonryGrid photos={latestPhotos} />
          </HomeSection>
        )}

        {filmCards.length > 0 && (
          <HomeSection
            title="Most photographed film stocks"
            link={{ href: '/films', label: 'All film stocks' }}
          >
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {filmCards.map(({ gear, count }, cardIndex) => (
                <GearBrowseCard
                  key={gear.id}
                  kind="film"
                  gear={gear}
                  href={canonicalFilmPath(gear)}
                  previews={filmPreviewsById.get(gear.id) ?? []}
                  photoCount={count}
                  cardIndex={cardIndex}
                  // h3: these sit under the section's own h2.
                  as="h3"
                />
              ))}
            </div>
          </HomeSection>
        )}

        {cameraCards.length > 0 && (
          <HomeSection
            title="Most photographed cameras"
            link={{ href: '/cameras', label: 'All cameras' }}
          >
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {cameraCards.map(({ gear, count }, cardIndex) => (
                <GearBrowseCard
                  key={gear.id}
                  kind="camera"
                  gear={gear}
                  href={canonicalCameraPath(gear)}
                  previews={cameraPreviewsById.get(gear.id) ?? []}
                  photoCount={count}
                  cardIndex={cardIndex}
                  as="h3"
                />
              ))}
            </div>
          </HomeSection>
        )}
      </main>

      <Footer />
    </div>
  )
}
