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
import ColorPalette from '@/components/ColorPalette'
import CommentSection from '@/components/CommentSection'
import TagList from '@/components/TagList'
import Lightbox from '@/components/Lightbox'
import { Vibrant } from 'node-vibrant/node'
import path from 'path'

import { stat } from 'fs/promises'

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
    include: { camera: true, filmStock: true, user: true, _count: { select: { likes: true } }, tags: { include: { tag: true } } }
  })

  const userLiked = userId ? await prisma.like.findUnique({
    where: { userId_photoId: { userId, photoId: id } }
  }) : null

  if (!photo) notFound()

  // Get prev/next photos
  const [prevPhoto, nextPhoto] = await Promise.all([
    prisma.photo.findFirst({
      where: { createdAt: { gt: photo.createdAt } },
      orderBy: { createdAt: 'asc' },
      select: { id: true }
    }),
    prisma.photo.findFirst({
      where: { createdAt: { lt: photo.createdAt } },
      orderBy: { createdAt: 'desc' },
      select: { id: true }
    })
  ])

  const isOwner = userId === photo.userId
  const colorPalette = await extractColors(photo.mediumPath)

  // Get file size
  let fileSize = ''
  try {
    const filePath = path.join(process.cwd(), 'public', photo.originalPath)
    const stats = await stat(filePath)
    const mb = stats.size / (1024 * 1024)
    fileSize = mb >= 1 ? `${mb.toFixed(1)} MB` : `${(stats.size / 1024).toFixed(0)} KB`
  } catch {}

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
              <div className="bg-[#1a1816] p-2 rounded-sm shadow-2xl relative">
                {/* Prev/Next Navigation */}
                {prevPhoto && (
                  <Link href={`/photos/${prevPhoto.id}`} className="absolute left-4 top-1/2 -translate-y-1/2 z-10 w-10 h-10 bg-black/50 hover:bg-black/80 flex items-center justify-center transition-colors">
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                  </Link>
                )}
                {nextPhoto && (
                  <Link href={`/photos/${nextPhoto.id}`} className="absolute right-4 top-1/2 -translate-y-1/2 z-10 w-10 h-10 bg-black/50 hover:bg-black/80 flex items-center justify-center transition-colors">
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </Link>
                )}

                <div className="flex">
                  {/* Left sprockets */}
                  <div className="w-6 bg-[#0f0e0d] flex flex-col justify-evenly py-4 shrink-0">
                    {[...Array(8)].map((_, i) => (
                      <div key={i} className="w-3 h-2 mx-auto rounded-sm bg-[#1a1816]" />
                    ))}
                  </div>

                  {/* Photo */}
                  <div className="flex-1 bg-black relative">
                    <div className="relative aspect-[3/2] w-full">
                      <Image
                        src={photo.mediumPath}
                        alt={photo.caption || ''}
                        fill
                        className="object-contain"
                        priority
                      />
                      <Lightbox
                        src={photo.originalPath}
                        alt={photo.caption || ''}
                        prevId={prevPhoto?.id}
                        nextId={nextPhoto?.id}
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

              {/* Color Palette */}
              <ColorPalette colors={colorPalette} />
            </div>

            {/* Right - Info Panel */}
            <div className="lg:w-80 space-y-6">
              {/* Author */}
              <Link href={`/${photo.user.username}`} className="flex items-center gap-4 group">
                <div className="w-14 h-14 bg-neutral-800 flex items-center justify-center text-white text-xl font-bold overflow-hidden">
                  {photo.user.avatar ? (
                    <Image src={photo.user.avatar} alt="" width={56} height={56} className="w-full h-full object-cover" />
                  ) : (
                    (photo.user.name || photo.user.username).charAt(0).toUpperCase()
                  )}
                </div>
                <div>
                  <p className="text-white font-medium text-lg group-hover:text-[#D32F2F] transition-colors">{photo.user.name || photo.user.username}</p>
                  <p className="text-neutral-500 text-sm">@{photo.user.username}</p>
                </div>
              </Link>

              {/* Caption */}
              {photo.caption && (
                <p className="text-neutral-300 leading-relaxed">{photo.caption}</p>
              )}

              {/* Tags */}
              {photo.tags.length > 0 && (
                <div className="pt-2">
                  <TagList tags={photo.tags} />
                </div>
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

                <div className="flex justify-between items-center">
                  <span className="text-neutral-500 text-sm">Resolution</span>
                  <span className="text-white text-sm">{photo.width} × {photo.height}</span>
                </div>

                {fileSize && (
                  <div className="flex justify-between items-center">
                    <span className="text-neutral-500 text-sm">Size</span>
                    <span className="text-white text-sm">{fileSize}</span>
                  </div>
                )}

                <a
                  href={photo.originalPath}
                  target="_blank"
                  className="block w-full text-center py-2 mt-2 border border-neutral-700 text-neutral-300 text-sm hover:bg-white hover:text-black transition-colors"
                >
                  View Original
                </a>
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

              {/* Comments */}
              <div className="pt-4 border-t border-neutral-800">
                <CommentSection photoId={photo.id} />
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
