import { prisma } from '@/lib/db'
import Link from 'next/link'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import Image from 'next/image'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import HeroMasonry from '@/components/HeroMasonry'

export const dynamic = 'force-dynamic'

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
      where: { published: true },
      select: { id: true, thumbnailPath: true, width: true, height: true }
    }),
    prisma.photo.count({ where: { published: true } }),
    prisma.filmStock.findMany({
      where: { imageStatus: 'approved', imageUrl: { not: null } },
      select: { id: true, name: true, brand: true, imageUrl: true }
    }),
    prisma.camera.findMany({
      where: { imageStatus: 'approved', imageUrl: { not: null } },
      select: { id: true, name: true, brand: true, imageUrl: true }
    })
  ])

  // Shuffle everything - get MORE items for impressive density
  const shuffledPhotos = shuffle(allPhotos).slice(0, 100).map(p => ({ ...p, type: 'photo' as const }))
  const shuffledFilms = shuffle(filmStocks).slice(0, 20).map(f => ({ ...f, type: 'film' as const }))
  const shuffledCameras = shuffle(cameras).slice(0, 20).map(c => ({ ...c, type: 'camera' as const }))

  // Mix them together - alternate film and camera, spread evenly
  const mixedItems: any[] = []
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
    <div className="h-screen bg-[#0a0a0a] flex flex-col overflow-hidden">
      <Header />

      {/* Hero - Full Height */}
      <section className="flex-1 relative flex items-center justify-center">
        {/* Masonry Background */}
        <HeroMasonry items={mixedItems} />

        {/* Overlay */}
        <div className="absolute inset-0 bg-[#0a0a0a]/70 pointer-events-none" />

        {/* Content */}
        <div className="relative z-10 text-center px-6">
          <div className="flex items-center justify-center mb-6">
            <Image src="/logo.svg" alt="AVOID X RAY" width={280} height={56} />
          </div>
          <p className="text-white/60 text-lg md:text-xl font-light mb-8">
            Protect your film. Share your work.
          </p>

          <div className="flex items-center justify-center gap-6 md:gap-10 mb-8">
            <Link href="/explore" className="group">
              <div className="text-2xl md:text-3xl font-black text-white group-hover:text-[#D32F2F] transition-colors">{totalPhotos}</div>
              <div className="text-[10px] text-neutral-500 uppercase tracking-wider group-hover:text-neutral-400 transition-colors">Photos</div>
            </Link>
            <div className="w-px h-8 bg-neutral-700" />
            <Link href="/films" className="group">
              <div className="text-2xl md:text-3xl font-black text-white group-hover:text-[#D32F2F] transition-colors">{filmStocks.length}</div>
              <div className="text-[10px] text-neutral-500 uppercase tracking-wider group-hover:text-neutral-400 transition-colors">Films</div>
            </Link>
            <div className="w-px h-8 bg-neutral-700" />
            <Link href="/cameras" className="group">
              <div className="text-2xl md:text-3xl font-black text-white group-hover:text-[#D32F2F] transition-colors">{cameras.length}</div>
              <div className="text-[10px] text-neutral-500 uppercase tracking-wider group-hover:text-neutral-400 transition-colors">Cameras</div>
            </Link>
          </div>

          <Link href={session ? "/upload" : "/register"} className="bg-[#D32F2F] text-white px-6 py-3 text-sm font-bold uppercase tracking-wider hover:bg-[#B71C1C] transition-colors">
            {session ? "Upload" : "Join"}
          </Link>
        </div>
      </section>
    </div>
  )
}
