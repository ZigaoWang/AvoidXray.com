import { prisma } from '@/lib/db'
import { notFound } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import DeleteButton from './DeleteButton'
import LikeButton from '@/components/LikeButton'

export default async function PhotoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)

  const userId = session?.user ? (session.user as { id: string }).id : null

  const photo = await prisma.photo.findUnique({
    where: { id },
    include: { camera: true, filmStock: true, user: true, _count: { select: { likes: true } } }
  })

  const userLiked = userId ? await prisma.like.findUnique({
    where: { userId_photoId: { userId, photoId: id } }
  }) : null

  if (!photo) notFound()

  const isOwner = userId === photo.userId

  const relatedPhotos = await prisma.photo.findMany({
    where: {
      id: { not: photo.id },
      OR: [
        { filmStockId: photo.filmStockId },
        { cameraId: photo.cameraId }
      ].filter(c => Object.values(c)[0] !== null)
    },
    take: 4,
    orderBy: { createdAt: 'desc' }
  })

  return (
    <div className="min-h-screen bg-[#141414] flex flex-col">
      <Header />

      <main className="flex-1 max-w-6xl mx-auto w-full py-8 px-6">
        <Link href="/" className="inline-flex items-center gap-2 text-neutral-500 hover:text-white text-sm mb-8 transition-colors">
          ← Back to Gallery
        </Link>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
          {/* Main Image */}
          <div className="lg:col-span-2">
            <div className="relative aspect-[3/2] w-full bg-[#1a1a1a] rounded-xl overflow-hidden">
              <Image
                src={photo.mediumPath}
                alt={photo.caption || 'Photo'}
                fill
                className="object-contain"
                priority
              />
            </div>
          </div>

          {/* Info Panel */}
          <div className="space-y-6">
            {/* Photographer */}
            <div className="bg-[#1a1a1a] rounded-xl p-6 border border-neutral-800/50">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-emerald-600 flex items-center justify-center text-white text-lg">
                  {(photo.user.name || photo.user.username).charAt(0).toUpperCase()}
                </div>
                <div>
                  <p className="text-white">{photo.user.name || photo.user.username}</p>
                  <p className="text-neutral-500 text-sm">@{photo.user.username}</p>
                </div>
              </div>
            </div>

            {/* Like Button */}
            <LikeButton photoId={photo.id} initialLiked={!!userLiked} initialCount={photo._count.likes} />

            {/* Caption */}
            {photo.caption && (
              <div className="bg-[#1a1a1a] rounded-xl p-6 border border-neutral-800/50">
                <p className="text-neutral-300 leading-relaxed">{photo.caption}</p>
              </div>
            )}

            {/* Technical Details */}
            <div className="bg-[#1a1a1a] rounded-xl p-6 border border-neutral-800/50">
              <h3 className="text-xs font-medium text-neutral-500 uppercase tracking-wider mb-4">Details</h3>

              {photo.camera && (
                <Link
                  href={`/cameras/${photo.camera.id}`}
                  className="flex items-center justify-between py-3 border-b border-neutral-800/50 hover:text-emerald-400 transition-colors"
                >
                  <span className="text-neutral-500 text-sm">Camera</span>
                  <span className="text-white text-sm">{photo.camera.brand ? `${photo.camera.brand} ${photo.camera.name}` : photo.camera.name}</span>
                </Link>
              )}

              {photo.filmStock && (
                <Link
                  href={`/films/${photo.filmStock.id}`}
                  className="flex items-center justify-between py-3 border-b border-neutral-800/50 hover:text-emerald-400 transition-colors"
                >
                  <span className="text-neutral-500 text-sm">Film Stock</span>
                  <span className="text-white text-sm">{photo.filmStock.brand ? `${photo.filmStock.brand} ${photo.filmStock.name}` : photo.filmStock.name}</span>
                </Link>
              )}

              <div className="flex items-center justify-between py-3">
                <span className="text-neutral-500 text-sm">Uploaded</span>
                <span className="text-white text-sm">{photo.createdAt.toLocaleDateString()}</span>
              </div>
            </div>

            {/* Owner Actions */}
            {isOwner && (
              <div className="flex gap-3">
                <Link
                  href={`/photos/${photo.id}/edit`}
                  className="flex-1 text-center bg-[#1a1a1a] border border-neutral-800/50 text-white py-3 rounded-lg hover:bg-neutral-800 transition-colors"
                >
                  Edit
                </Link>
                <DeleteButton photoId={photo.id} />
              </div>
            )}
          </div>
        </div>

        {/* Related Photos */}
        {relatedPhotos.length > 0 && (
          <section className="mt-16">
            <h2 className="text-2xl text-white mb-8">More Like This</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {relatedPhotos.map(p => (
                <Link
                  key={p.id}
                  href={`/photos/${p.id}`}
                  className="relative aspect-[3/2] bg-[#1a1a1a] rounded-lg overflow-hidden"
                >
                  <Image src={p.thumbnailPath} alt="" fill className="object-cover" sizes="(max-width: 768px) 50vw, 25vw" />
                </Link>
              ))}
            </div>
          </section>
        )}
      </main>

      <Footer />
    </div>
  )
}
