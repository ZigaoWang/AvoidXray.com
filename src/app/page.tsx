import { prisma } from '@/lib/db'
import FilmStrip from '@/components/FilmStrip'
import Link from 'next/link'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import Image from 'next/image'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

export default async function Home() {
  const session = await getServerSession(authOptions)
  const userId = session?.user ? (session.user as { id: string }).id : null

  const photos = await prisma.photo.findMany({
    orderBy: { createdAt: 'desc' },
    include: { filmStock: true, camera: true, user: true, _count: { select: { likes: true } } }
  })

  const userLikes = userId ? await prisma.like.findMany({
    where: { userId },
    select: { photoId: true }
  }) : []
  const likedIds = new Set(userLikes.map(l => l.photoId))
  const photosWithLiked = photos.map(p => ({ ...p, liked: likedIds.has(p.id) }))

  const totalPhotos = photos.length
  const filmStockCount = await prisma.filmStock.count()
  const cameraCount = await prisma.camera.count()

  // Get random photos for hero background
  const heroPhotos = photos.slice(0, 6)

  const strips: typeof photosWithLiked[] = []
  let i = 0
  while (i < photosWithLiked.length) {
    strips.push(photosWithLiked.slice(i, i + 5))
    i += 5
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex flex-col">
      <Header />

      {/* Hero - Centered with background images */}
      <section className="relative min-h-[70vh] flex items-center justify-center overflow-hidden">
        {/* Background image grid */}
        {heroPhotos.length > 0 && (
          <div className="absolute inset-0 grid grid-cols-3 gap-1 opacity-40">
            {heroPhotos.map((photo, idx) => (
              <div key={photo.id} className="relative">
                <Image
                  src={photo.thumbnailPath}
                  alt=""
                  fill
                  className="object-cover"
                  sizes="33vw"
                />
              </div>
            ))}
          </div>
        )}

        {/* Gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-b from-[#0a0a0a] via-[#0a0a0a]/80 to-[#0a0a0a]" />

        {/* Content */}
        <div className="relative z-10 text-center px-6">
          {/* Logo */}
          <div className="flex items-center justify-center gap-1 mb-8">
            <span className="bg-[#D32F2F] text-white font-black text-2xl md:text-4xl px-3 py-2 tracking-tight">AVOID</span>
            <span className="bg-white text-black font-black text-2xl md:text-4xl px-3 py-2 tracking-tight">X RAY</span>
          </div>
          <p className="text-white/60 text-xl md:text-2xl font-light mb-10">
            Protect your film. Share your work.
          </p>

          {/* Stats */}
          <div className="flex items-center justify-center gap-8 md:gap-12 mb-10">
            <div>
              <div className="text-3xl md:text-4xl font-black text-white">{totalPhotos}</div>
              <div className="text-xs text-neutral-500 uppercase tracking-wider">Photos</div>
            </div>
            <div className="w-px h-10 bg-neutral-800" />
            <div>
              <div className="text-3xl md:text-4xl font-black text-white">{filmStockCount}</div>
              <div className="text-xs text-neutral-500 uppercase tracking-wider">Films</div>
            </div>
            <div className="w-px h-10 bg-neutral-800" />
            <div>
              <div className="text-3xl md:text-4xl font-black text-white">{cameraCount}</div>
              <div className="text-xs text-neutral-500 uppercase tracking-wider">Cameras</div>
            </div>
          </div>

          {/* CTAs */}
          <div className="flex items-center justify-center gap-4">
            <a href="#gallery" className="bg-[#D32F2F] text-white px-8 py-4 text-sm font-bold uppercase tracking-wider hover:bg-[#B71C1C] transition-colors">
              Browse
            </a>
            <Link href="/register" className="border border-neutral-700 text-white px-8 py-4 text-sm font-bold uppercase tracking-wider hover:bg-white hover:text-black transition-colors">
              Upload
            </Link>
          </div>
        </div>
      </section>

      {/* Gallery */}
      <main id="gallery" className="flex-1 scroll-mt-8">
        <div className="max-w-7xl mx-auto px-6 py-16">
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-lg font-bold text-white uppercase tracking-wide">Recent</h2>
            <span className="text-neutral-600 text-xs font-mono">{totalPhotos} total</span>
          </div>

          {photos.length === 0 ? (
            <div className="text-center py-32 border border-dashed border-neutral-800">
              <p className="text-neutral-500 mb-6">No photos yet</p>
              <Link href="/register" className="bg-[#D32F2F] text-white px-6 py-3 text-sm font-bold uppercase tracking-wider hover:bg-[#B71C1C] transition-colors inline-block">
                Be First
              </Link>
            </div>
          ) : (
            <div className="space-y-4">
              {strips.map((stripPhotos, idx) => (
                <FilmStrip key={idx} photos={stripPhotos} />
              ))}
            </div>
          )}
        </div>
      </main>

      <Footer />
    </div>
  )
}
