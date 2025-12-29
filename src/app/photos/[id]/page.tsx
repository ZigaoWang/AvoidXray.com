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
import { Vibrant } from 'node-vibrant/node'
import path from 'path'

async function extractColors(imagePath: string) {
  try {
    const fullPath = path.join(process.cwd(), 'public', imagePath)
    const palette = await Vibrant.from(fullPath).getPalette()

    const colors = [
      { color: palette.Vibrant?.hex || '#333', name: 'Vibrant' },
      { color: palette.DarkVibrant?.hex || '#222', name: 'Dark' },
      { color: palette.LightVibrant?.hex || '#666', name: 'Light' },
      { color: palette.Muted?.hex || '#444', name: 'Muted' },
      { color: palette.DarkMuted?.hex || '#111', name: 'Shadow' },
    ].filter(c => c.color !== '#333' && c.color !== '#222' && c.color !== '#666' && c.color !== '#444' && c.color !== '#111')

    return colors.length > 0 ? colors : [
      { color: '#2d2926', name: 'Base' },
      { color: '#8b7355', name: 'Mid' },
      { color: '#d4c4b0', name: 'Light' },
    ]
  } catch {
    return [
      { color: '#2d2926', name: 'Base' },
      { color: '#8b7355', name: 'Mid' },
      { color: '#d4c4b0', name: 'Light' },
    ]
  }
}

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
  const colorPalette = await extractColors(photo.mediumPath)

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
        <div className="max-w-6xl mx-auto px-6 py-8">
          <div className="flex flex-col lg:flex-row gap-8">
            {/* Left - Photo with film border */}
            <div className="lg:flex-1">
              {/* Film frame */}
              <div className="bg-[#1a1816] p-2 rounded-sm shadow-2xl">
                <div className="flex">
                  {/* Left sprockets */}
                  <div className="w-6 bg-[#0f0e0d] flex flex-col justify-evenly py-4 shrink-0">
                    {[...Array(8)].map((_, i) => (
                      <div key={i} className="w-3 h-2 mx-auto rounded-sm bg-[#1a1816]" />
                    ))}
                  </div>

                  {/* Photo */}
                  <div className="flex-1 bg-black">
                    <div className="relative aspect-[3/2] w-full">
                      <Image
                        src={photo.mediumPath}
                        alt={photo.caption || ''}
                        fill
                        className="object-contain"
                        priority
                      />
                    </div>
                  </div>

                  {/* Right sprockets */}
                  <div className="w-6 bg-[#0f0e0d] flex flex-col justify-evenly py-4 shrink-0">
                    {[...Array(8)].map((_, i) => (
                      <div key={i} className="w-3 h-2 mx-auto rounded-sm bg-[#1a1816]" />
                    ))}
                  </div>
                </div>

                {/* Film edge text */}
                <div className="flex justify-between items-center px-8 py-1 text-[10px] text-[#FFEB3B]/60 font-mono tracking-wider">
                  <span>{photo.filmStock?.name || 'FILM'}</span>
                  <span>{photo.createdAt.getFullYear()}</span>
                </div>
              </div>

              {/* Color Palette Bar */}
              <div className="mt-6">
                <p className="text-neutral-500 text-xs uppercase tracking-wider mb-3">Color Palette</p>
                <div className="flex h-4 rounded overflow-hidden">
                  {colorPalette.map((c, i) => (
                    <div
                      key={i}
                      style={{ backgroundColor: c.color, flex: 1 }}
                      className="h-full"
                    />
                  ))}
                </div>
                <div className="flex mt-3 gap-6">
                  {colorPalette.map((c, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <div className="w-4 h-4 rounded" style={{ backgroundColor: c.color }} />
                      <div>
                        <span className="text-neutral-400 text-xs block">{c.name}</span>
                        <span className="text-neutral-600 text-[10px] font-mono uppercase">{c.color}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Right - Info Panel */}
            <div className="lg:w-80 space-y-6">
              {/* Author */}
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 bg-neutral-800 flex items-center justify-center text-white text-xl font-bold">
                  {(photo.user.name || photo.user.username).charAt(0).toUpperCase()}
                </div>
                <div>
                  <p className="text-white font-medium text-lg">{photo.user.name || photo.user.username}</p>
                  <p className="text-neutral-500 text-sm">@{photo.user.username}</p>
                </div>
              </div>

              {/* Caption */}
              {photo.caption && (
                <p className="text-neutral-300 leading-relaxed">{photo.caption}</p>
              )}

              {/* Details */}
              <div className="space-y-4 pt-4 border-t border-neutral-800">
                {photo.camera && (
                  <div className="flex justify-between items-center">
                    <span className="text-neutral-500 text-sm">Camera</span>
                    <Link href={`/cameras/${photo.camera.id}`} className="text-white text-sm hover:text-[#D32F2F] transition-colors">
                      {photo.camera.name}
                    </Link>
                  </div>
                )}

                {photo.filmStock && (
                  <div className="flex justify-between items-center">
                    <span className="text-neutral-500 text-sm">Film</span>
                    <Link href={`/films/${photo.filmStock.id}`} className="text-white text-sm hover:text-[#D32F2F] transition-colors">
                      {photo.filmStock.name}
                    </Link>
                  </div>
                )}

                <div className="flex justify-between items-center">
                  <span className="text-neutral-500 text-sm">Date</span>
                  <span className="text-white text-sm">
                    {photo.createdAt.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
                  </span>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-4 pt-4 border-t border-neutral-800">
                <LikeButton photoId={photo.id} initialLiked={!!userLiked} initialCount={photo._count.likes} />
                {isOwner && (
                  <>
                    <Link href={`/photos/${photo.id}/edit`} className="text-neutral-500 hover:text-white text-sm transition-colors">
                      Edit
                    </Link>
                    <DeleteButton photoId={photo.id} />
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Related Photos */}
        {relatedPhotos.length > 0 && (
          <section className="border-t border-neutral-900 mt-8">
            <div className="max-w-6xl mx-auto px-6 py-12">
              <h2 className="text-sm text-neutral-500 uppercase tracking-wider mb-6">More like this</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {relatedPhotos.map(p => (
                  <Link key={p.id} href={`/photos/${p.id}`} className="group relative aspect-[3/2] bg-neutral-900 overflow-hidden">
                    <Image src={p.thumbnailPath} alt="" fill className="object-cover group-hover:scale-105 transition-transform duration-300" sizes="25vw" />
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
