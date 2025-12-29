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
    <div className="min-h-screen bg-[#0a0a0a] flex flex-col">
      <Header />

      {/* Hero */}
      <section className="border-b border-neutral-800/50">
        <div className="max-w-7xl mx-auto px-6 py-16">
          <h1 className="text-3xl text-white mb-3">Welcome to Film Gallery</h1>
          <p className="text-neutral-500">A community for analog photography enthusiasts</p>
        </div>
      </section>

      {/* Film Strips Section */}
      <main className="flex-1 border-t border-neutral-800/50">
        <div className="max-w-7xl mx-auto px-6 py-16">
          <div className="flex items-baseline justify-between mb-12">
            <h2 className="text-2xl text-white" >
              Recent Work
            </h2>
            <span className="text-neutral-600 text-sm">{totalPhotos} photographs</span>
          </div>

          {photos.length === 0 ? (
            <div className="text-center py-32">
              <p className="text-neutral-500 text-lg mb-8">No photographs yet.</p>
              <Link
                href="/register"
                className="inline-block text-white border border-neutral-700 px-8 py-3 text-sm tracking-wider uppercase hover:bg-white hover:text-black transition-colors"
              >
                Be the first
              </Link>
            </div>
          ) : (
            <div className="space-y-6">
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
