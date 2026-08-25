import { prisma } from '@/lib/db'
import Link from 'next/link'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import Image from 'next/image'
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

  const [allPhotos, totalPhotos, filmStocks, cameras] = await Promise.all([
    prisma.photo.findMany({
      where: { ...PUBLIC_PHOTO },
      select: {
        id: true, thumbnailPath: true, width: true, height: true, blurHash: true, caption: true,
        filmStock: { select: { name: true, brand: true } },
        camera: { select: { name: true, brand: true } },
        user: { select: { name: true, username: true } },
      }
    }),
    prisma.photo.count({ where: { ...PUBLIC_PHOTO } }),
    prisma.filmStock.findMany({
      where: { imageStatus: 'approved', imageUrl: { not: null } },
      select: { id: true, slug: true, name: true, brand: true, imageUrl: true }
    }),
    prisma.camera.findMany({
      where: { imageStatus: 'approved', imageUrl: { not: null } },
      select: { id: true, slug: true, name: true, brand: true, imageUrl: true }
    })
  ])

  // Shuffle everything - get MORE items for impressive density
  const shuffledPhotos = shuffle(allPhotos).slice(0, 100).map(p => ({ ...p, type: 'photo' as const }))
  const shuffledFilms = shuffle(filmStocks).slice(0, 20).map(f => ({ ...f, type: 'film' as const }))
  const shuffledCameras = shuffle(cameras).slice(0, 20).map(c => ({ ...c, type: 'camera' as const }))

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
    <div className="min-h-screen bg-[#0a0a0a] flex flex-col">
      <Header />

      <HeroSection
        items={mixedItems}
        totalPhotos={totalPhotos}
        totalFilms={filmStocks.length}
        totalCameras={cameras.length}
        isLoggedIn={!!session}
      />

      <Footer />
    </div>
  )
}
