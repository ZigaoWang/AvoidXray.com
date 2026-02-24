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

  // Shuffle everything
  const shuffledPhotos = shuffle(allPhotos).slice(0, 30).map(p => ({ ...p, type: 'photo' as const }))
  const shuffledFilms = shuffle(filmStocks).slice(0, 6).map(f => ({ ...f, type: 'film' as const }))
  const shuffledCameras = shuffle(cameras).slice(0, 6).map(c => ({ ...c, type: 'camera' as const }))

  // Mix them together - interleave films/cameras every few photos
  const mixedItems: any[] = []
  const filmCameraItems = shuffle([...shuffledFilms, ...shuffledCameras])
  let fcIndex = 0

  shuffledPhotos.forEach((photo, i) => {
    mixedItems.push(photo)
    // Insert a film/camera every 3-4 photos
    if ((i + 1) % 3 === 0 && fcIndex < filmCameraItems.length) {
      mixedItems.push(filmCameraItems[fcIndex])
      fcIndex++
    }
  })

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex flex-col">
      <Header />

      {/* Hero - Full Height */}
      <section className="flex-1 relative flex items-center justify-center overflow-hidden min-h-[calc(100vh-64px)]">
        {/* Masonry Background */}
        <div className="absolute inset-0">
          <HeroMasonry items={mixedItems} />
        </div>

        {/* Overlay */}
        <div className="absolute inset-0 bg-[#0a0a0a]/70" />

        {/* Content */}
        <div className="relative z-10 text-center px-6">
          <div className="flex items-center justify-center mb-8">
            <Image src="/logo.svg" alt="AVOID X RAY" width={300} height={60} />
          </div>
          <p className="text-white/60 text-xl md:text-2xl font-light mb-10">
            Protect your film. Share your work.
          </p>

          <div className="flex items-center justify-center gap-8 md:gap-12 mb-10">
            <Link href="/explore" className="group">
              <div className="text-3xl md:text-4xl font-black text-white group-hover:text-[#D32F2F] transition-colors">{totalPhotos}</div>
              <div className="text-xs text-neutral-500 uppercase tracking-wider group-hover:text-neutral-400 transition-colors">Photos</div>
            </Link>
            <div className="w-px h-10 bg-neutral-800" />
            <Link href="/films" className="group">
              <div className="text-3xl md:text-4xl font-black text-white group-hover:text-[#D32F2F] transition-colors">{filmStocks.length}</div>
              <div className="text-xs text-neutral-500 uppercase tracking-wider group-hover:text-neutral-400 transition-colors">Films</div>
            </Link>
            <div className="w-px h-10 bg-neutral-800" />
            <Link href="/cameras" className="group">
              <div className="text-3xl md:text-4xl font-black text-white group-hover:text-[#D32F2F] transition-colors">{cameras.length}</div>
              <div className="text-xs text-neutral-500 uppercase tracking-wider group-hover:text-neutral-400 transition-colors">Cameras</div>
            </Link>
          </div>

          <Link href={session ? "/upload" : "/register"} className="bg-[#D32F2F] text-white px-8 py-4 text-sm font-bold uppercase tracking-wider hover:bg-[#B71C1C] transition-colors">
            {session ? "Upload" : "Join"}
          </Link>
        </div>
      </section>

      <Footer />
    </div>
  )
}
