import { prisma } from '@/lib/db'
import FilmStrip from '@/components/FilmStrip'
import Link from 'next/link'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
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

  // Group photos into strips of 5 photos each
  const strips: typeof photosWithLiked[] = []
  let i = 0
  while (i < photosWithLiked.length) {
    strips.push(photosWithLiked.slice(i, i + 5))
    i += 5
  }

  return (
    <div className="min-h-screen bg-[#141414] flex flex-col">
      <Header />

      {/* Hero Section */}
      <section className="border-b border-neutral-800/50">
        <div className="max-w-7xl mx-auto px-6 py-20">
          <h1 className="text-5xl md:text-6xl text-white mb-6 leading-tight">
            Discover the Art of<br />
            <span className="text-emerald-400">Film Photography</span>
          </h1>
          <p className="text-lg text-neutral-400 max-w-2xl mb-10 leading-relaxed">
            A curated community gallery for analog photography enthusiasts. Share your work, explore different film stocks, and connect with fellow photographers who appreciate the timeless beauty of film.
          </p>
          <div className="flex gap-12">
            <div>
              <span className="text-4xl font-light text-white">{totalPhotos}</span>
              <p className="text-neutral-500 text-sm mt-1">Photos</p>
            </div>
            <div>
              <span className="text-4xl font-light text-white">{filmStockCount}</span>
              <p className="text-neutral-500 text-sm mt-1">Film Stocks</p>
            </div>
            <div>
              <span className="text-4xl font-light text-white">{cameraCount}</span>
              <p className="text-neutral-500 text-sm mt-1">Cameras</p>
            </div>
          </div>
        </div>
      </section>

      <main className="flex-1 py-12">
        {photos.length === 0 ? (
          <div className="text-center py-24 px-6">
            <div className="text-7xl mb-8">🎞️</div>
            <h2 className="text-3xl text-white mb-4">No photos yet</h2>
            <p className="text-neutral-400 mb-10 max-w-md mx-auto leading-relaxed">
              Be the first to share your film photography with the community and inspire others.
            </p>
            <Link
              href="/register"
              className="inline-block bg-emerald-600 text-white px-8 py-3 rounded-full hover:bg-emerald-500 transition-colors"
            >
              Get Started
            </Link>
          </div>
        ) : (
          <div className="space-y-8">
            {strips.map((stripPhotos, idx) => (
              <FilmStrip key={idx} photos={stripPhotos} />
            ))}
          </div>
        )}
      </main>

      <Footer />
    </div>
  )
}
