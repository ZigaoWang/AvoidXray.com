import { prisma } from '@/lib/db'
import Link from 'next/link'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import Image from 'next/image'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import QuickLikeButton from '@/components/QuickLikeButton'

export const dynamic = 'force-dynamic'

export default async function Home() {
  const session = await getServerSession(authOptions)
  const userId = (session?.user as { id?: string } | undefined)?.id

  const [allPhotos, totalPhotos, filmStockCount, cameraCount] = await Promise.all([
    prisma.photo.findMany({
      include: { filmStock: true, camera: true, user: true, _count: { select: { likes: true } } }
    }),
    prisma.photo.count(),
    prisma.filmStock.count(),
    prisma.camera.count()
  ])

  const userLikes = userId ? await prisma.like.findMany({
    where: { userId },
    select: { photoId: true }
  }) : []
  const likedIds = new Set(userLikes.map(l => l.photoId))

  // True random shuffle using Fisher-Yates
  const shuffled = [...allPhotos]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }
  const heroPhotos = shuffled.slice(0, 6)
  const previewPhotos = shuffled.slice(0, 8).map(p => ({ ...p, liked: likedIds.has(p.id) }))

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex flex-col">
      <Header />

      {/* Hero */}
      <section className="relative min-h-[60vh] flex items-center justify-center overflow-hidden">
        {heroPhotos.length > 0 && (
          <div className="absolute inset-0 grid grid-cols-3 gap-1">
            {heroPhotos.map(photo => (
              <div key={photo.id} className="relative">
                <Image src={photo.thumbnailPath} alt="" fill className="object-cover" sizes="33vw" />
              </div>
            ))}
          </div>
        )}

        <div className="absolute inset-0 bg-gradient-to-b from-[#0a0a0a] via-[#0a0a0a]/80 to-[#0a0a0a]" />

        <div className="relative z-10 text-center px-6">
          <div className="flex items-center justify-center mb-8">
            <Image src="/logo.svg" alt="AVOID X RAY" width={300} height={60} />
          </div>
          <p className="text-white/60 text-xl md:text-2xl font-light mb-10">
            Protect your film. Share your work.
          </p>

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

          <Link href={session ? "/upload" : "/register"} className="bg-[#D32F2F] text-white px-8 py-4 text-sm font-bold uppercase tracking-wider hover:bg-[#B71C1C] transition-colors">
            {session ? "Upload" : "Join"}
          </Link>
        </div>
      </section>

      {/* Preview Photos */}
      {previewPhotos.length > 0 && (
        <section className="py-16">
          <div className="max-w-7xl mx-auto px-6">
            <h2 className="text-lg font-bold text-white uppercase tracking-wide mb-8">Explore Our Community</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
              {previewPhotos.map(photo => (
                <Link key={photo.id} href={`/photos/${photo.id}`} className="relative aspect-square bg-neutral-900 group overflow-hidden">
                  <Image
                    src={photo.thumbnailPath}
                    alt={photo.caption || ''}
                    fill
                    className="object-cover"
                    sizes="25vw"
                  />
                  <QuickLikeButton
                    photoId={photo.id}
                    initialLiked={photo.liked}
                    initialCount={photo._count.likes}
                  />
                </Link>
              ))}
            </div>
            <div className="text-center">
              <Link href="/explore" className="bg-[#D32F2F] text-white px-8 py-4 text-sm font-bold uppercase tracking-wider hover:bg-[#B71C1C] transition-colors inline-block">
                Explore All Photos
              </Link>
            </div>
          </div>
        </section>
      )}

      <Footer />
    </div>
  )
}
