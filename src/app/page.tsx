import { prisma } from '@/lib/db'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import HeroSection from '@/components/HeroSection'
import type { MasonryItem } from '@/components/HeroMasonry'
import type { Metadata } from 'next'
import { SITE_URL } from '@/lib/seo/site'
import { PUBLIC_PHOTO } from '@/lib/photoVisibility'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'AvoidXray – Film Photography Community',
  description:
    'Browse real film photography organised by film stock and camera. See how Kodak, Fujifilm, Ilford and Cinestill stocks actually render before you buy a roll — every frame is an unedited scan uploaded by the photographer who shot it.',
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
      'Real film photography organised by film stock and camera. See how a stock actually renders before you buy a roll.',
    url: SITE_URL,
    type: 'website',
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

// Fisher-Yates shuffle
function shuffle<T>(array: T[]): T[] {
  const shuffled = [...array]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }
  return shuffled
}

export default async function Home() {
  const session = await getServerSession(authOptions)

  const [
    photoPool,
    totalPhotos,
    totalFilms,
    totalCameras,
    filmStocks,
    cameras,
  ] = await Promise.all([
    prisma.photo.findMany({
      where: { ...PUBLIC_PHOTO },
      select: {
        id: true, thumbnailPath: true, width: true, height: true, blurHash: true, caption: true,
        filmStock: { select: { name: true, brand: true } },
        camera: { select: { name: true, brand: true } },
        user: { select: { name: true, username: true } },
      },
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
    })
  ])

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

      <HeroSection
        items={mixedItems}
        totalPhotos={totalPhotos}
        totalFilms={totalFilms}
        totalCameras={totalCameras}
        isLoggedIn={!!session}
      />

      <Footer />
    </div>
  )
}
