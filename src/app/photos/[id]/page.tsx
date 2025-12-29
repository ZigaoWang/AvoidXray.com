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
    <div className="min-h-screen bg-[#0a0a0a] flex flex-col">
      <Header />

      <main className="flex-1">
        {/* Back link */}
        <div className="max-w-7xl mx-auto px-6 py-6">
          <Link href="/" className="text-xs text-neutral-600 hover:text-white transition-colors uppercase tracking-wider">
            ← Back
          </Link>
        </div>

        {/* Photo */}
        <div className="max-w-5xl mx-auto px-6 pb-16">
          <div className="relative aspect-[3/2] w-full bg-neutral-950 mb-8">
            <Image
              src={photo.mediumPath}
              alt={photo.caption || 'Photo'}
              fill
              className="object-contain"
              priority
            />
          </div>

          {/* Info row */}
          <div className="flex items-start justify-between gap-8 border-t border-neutral-900 pt-8">
            <div className="flex-1 min-w-0">
              {/* Photographer */}
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-full bg-neutral-800 flex items-center justify-center text-white text-sm">
                  {(photo.user.name || photo.user.username).charAt(0).toUpperCase()}
                </div>
                <div>
                  <p className="text-white text-sm">{photo.user.name || photo.user.username}</p>
                  <p className="text-neutral-600 text-xs">@{photo.user.username}</p>
                </div>
              </div>

              {/* Caption */}
              {photo.caption && (
                <p className="text-neutral-400 text-sm leading-relaxed mb-6">{photo.caption}</p>
              )}

              {/* Details */}
              <div className="flex flex-wrap gap-x-8 gap-y-2 text-xs">
                {photo.camera && (
                  <Link href={`/cameras/${photo.camera.id}`} className="text-neutral-500 hover:text-white transition-colors">
                    {photo.camera.brand ? `${photo.camera.brand} ${photo.camera.name}` : photo.camera.name}
                  </Link>
                )}
                {photo.filmStock && (
                  <Link href={`/films/${photo.filmStock.id}`} className="text-neutral-500 hover:text-white transition-colors">
                    {photo.filmStock.brand ? `${photo.filmStock.brand} ${photo.filmStock.name}` : photo.filmStock.name}
                  </Link>
                )}
                <span className="text-neutral-700">{photo.createdAt.toLocaleDateString()}</span>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-4">
              <LikeButton photoId={photo.id} initialLiked={!!userLiked} initialCount={photo._count.likes} />
              {isOwner && (
                <>
                  <Link
                    href={`/photos/${photo.id}/edit`}
                    className="text-xs text-neutral-600 hover:text-white transition-colors uppercase tracking-wider"
                  >
                    Edit
                  </Link>
                  <DeleteButton photoId={photo.id} />
                </>
              )}
            </div>
          </div>
        </div>

        {/* Related */}
        {relatedPhotos.length > 0 && (
          <section className="border-t border-neutral-900">
            <div className="max-w-7xl mx-auto px-6 py-16">
              <h2 className="text-sm text-neutral-500 uppercase tracking-wider mb-8">More like this</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {relatedPhotos.map(p => (
                  <Link key={p.id} href={`/photos/${p.id}`} className="relative aspect-[3/2] bg-neutral-950 overflow-hidden">
                    <Image src={p.thumbnailPath} alt="" fill className="object-cover" sizes="(max-width: 768px) 50vw, 25vw" />
                  </Link>
                ))}
              </div>
            </div>
          </section>
        )}
      </main>

      <Footer />
    </div>
  )
}
