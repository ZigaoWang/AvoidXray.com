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
import CommentSection from '@/components/CommentSection'
import Lightbox from '@/components/Lightbox'
import WatermarkButton from '@/components/WatermarkButton'
import path from 'path'
import type { Metadata } from 'next'

import { stat } from 'fs/promises'

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params
  const photo = await prisma.photo.findUnique({
    where: { id },
    include: { user: true, camera: true, filmStock: true }
  })

  if (!photo || !photo.published) {
    return { title: 'Photo Not Found' }
  }

  const photographer = photo.user.name || photo.user.username
  const camera = photo.camera ? (photo.camera.brand ? `${photo.camera.brand} ${photo.camera.name}` : photo.camera.name) : null
  const film = photo.filmStock ? (photo.filmStock.brand ? `${photo.filmStock.brand} ${photo.filmStock.name}` : photo.filmStock.name) : null

  const titleParts = [photo.caption || 'Film Photo']
  if (photographer) titleParts.push(`by ${photographer}`)
  const title = titleParts.join(' ')

  const descParts = [`Film photograph by ${photographer}`]
  if (camera) descParts.push(`Shot on ${camera}`)
  if (film) descParts.push(`using ${film}`)
  const description = descParts.join('. ') + '.'

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: 'article',
      url: `https://avoidxray.com/photos/${id}`,
      images: [
        {
          url: photo.mediumPath,
          width: photo.width,
          height: photo.height,
          alt: photo.caption || `Film photo by ${photographer}`,
        },
      ],
      authors: [photographer],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [photo.mediumPath],
    },
  }
}

export default async function PhotoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  const userId = session?.user ? (session.user as { id: string }).id : null

  const photo = await prisma.photo.findUnique({
    where: { id },
    include: {
      camera: true,
      filmStock: true,
      user: true,
      _count: { select: { likes: true } }
    }
  })

  const userLiked = userId ? await prisma.like.findUnique({
    where: { userId_photoId: { userId, photoId: id } }
  }) : null

  if (!photo || !photo.published) notFound()

  // Get prev/next photos
  const [prevPhoto, nextPhoto] = await Promise.all([
    prisma.photo.findFirst({
      where: { published: true, createdAt: { gt: photo.createdAt } },
      orderBy: { createdAt: 'asc' },
      select: { id: true }
    }),
    prisma.photo.findFirst({
      where: { published: true, createdAt: { lt: photo.createdAt } },
      orderBy: { createdAt: 'desc' },
      select: { id: true }
    })
  ])

  const isOwner = userId === photo.userId
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
      published: true,
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
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-6 md:py-8">
          <div className="flex flex-col lg:flex-row gap-6 md:gap-8">
            {/* Left - Photo with film border */}
            <div className="lg:flex-1">
              {/* Film frame */}
              <div className="bg-[#1a1816] p-2 rounded-sm shadow-2xl">
                <div className="flex">
                  {/* Left sprockets */}
                  <div className="w-4 md:w-6 bg-[#0f0e0d] flex flex-col justify-evenly py-4 shrink-0">
                    {[...Array(8)].map((_, i) => (
                      <div key={i} className="w-2 md:w-3 h-1.5 md:h-2 mx-auto rounded-sm bg-[#1a1816]" />
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
                  <div className="w-4 md:w-6 bg-[#0f0e0d] flex flex-col justify-evenly py-4 shrink-0">
                    {[...Array(8)].map((_, i) => (
                      <div key={i} className="w-2 md:w-3 h-1.5 md:h-2 mx-auto rounded-sm bg-[#1a1816]" />
                    ))}
                  </div>
                </div>

                {/* Film edge text */}
                <div className="flex justify-between items-center px-4 md:px-8 py-1 text-[9px] md:text-[10px] text-[#FFEB3B]/60 font-mono tracking-wider">
                  <span>{photo.filmStock?.name || 'FILM'}</span>
                  <span>{photo.createdAt.getFullYear()}</span>
                </div>
              </div>

              {/* Camera and Film Cards Below Photo */}
              {(photo.camera || photo.filmStock) && (
                <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                  {photo.camera && (
                    <Link
                      href={`/cameras/${photo.camera.id}`}
                      className="group bg-neutral-900 border border-neutral-800 hover:border-[#D32F2F] transition-all p-4 flex items-center gap-4"
                    >
                      <div className="relative w-20 h-16 flex-shrink-0 flex items-center justify-center">
                        {photo.camera.imageUrl && photo.camera.imageStatus === 'approved' ? (
                          <Image
                            src={photo.camera.imageUrl}
                            alt={photo.camera.name}
                            fill
                            className="object-contain"
                          />
                        ) : (
                          <svg className="w-8 h-8 text-neutral-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                          </svg>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs text-neutral-500 mb-1 uppercase tracking-wide">Camera</div>
                        <div className="text-white font-semibold group-hover:text-[#D32F2F] transition-colors truncate">
                          {photo.camera.brand ? `${photo.camera.brand} ${photo.camera.name}` : photo.camera.name}
                        </div>
                      </div>
                      <svg className="w-5 h-5 text-neutral-600 group-hover:text-[#D32F2F] transition-colors flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </Link>
                  )}

                  {photo.filmStock && (
                    <Link
                      href={`/films/${photo.filmStock.id}`}
                      className="group bg-neutral-900 border border-neutral-800 hover:border-[#D32F2F] transition-all p-4 flex items-center gap-4"
                    >
                      <div className="relative w-20 h-16 flex-shrink-0 flex items-center justify-center">
                        {photo.filmStock.imageUrl && photo.filmStock.imageStatus === 'approved' ? (
                          <Image
                            src={photo.filmStock.imageUrl}
                            alt={photo.filmStock.name}
                            fill
                            className="object-contain"
                          />
                        ) : (
                          <svg className="w-8 h-8 text-neutral-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
                          </svg>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs text-neutral-500 mb-1 uppercase tracking-wide">Film Stock</div>
                        <div className="text-white font-semibold group-hover:text-[#D32F2F] transition-colors truncate">
                          {photo.filmStock.brand ? `${photo.filmStock.brand} ${photo.filmStock.name}` : photo.filmStock.name}
                        </div>
                        {photo.filmStock.iso && (
                          <div className="text-xs text-neutral-500">ISO {photo.filmStock.iso}</div>
                        )}
                      </div>
                      <svg className="w-5 h-5 text-neutral-600 group-hover:text-[#D32F2F] transition-colors flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </Link>
                  )}
                </div>
              )}

              {/* Prev/Next Navigation */}
              <div className="flex justify-between mt-4">
                {prevPhoto ? (
                  <Link href={`/photos/${prevPhoto.id}`} className="text-neutral-500 hover:text-white text-sm flex items-center gap-2 transition-colors">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                    Previous
                  </Link>
                ) : <span />}
                {nextPhoto ? (
                  <Link href={`/photos/${nextPhoto.id}`} className="text-neutral-500 hover:text-white text-sm flex items-center gap-2 transition-colors">
                    Next
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </Link>
                ) : <span />}
              </div>
            </div>

            {/* Right - Info Panel */}
            <div className="lg:w-80 space-y-6">
              {/* Author */}
              <Link href={`/${photo.user.username}`} className="flex items-center gap-4 group bg-neutral-900 border border-neutral-800 p-4 hover:border-[#D32F2F] transition-colors">
                <div className="w-14 h-14 bg-neutral-800 flex items-center justify-center text-white text-xl font-bold overflow-hidden flex-shrink-0">
                  {photo.user.avatar ? (
                    <Image src={photo.user.avatar} alt="" width={56} height={56} className="w-full h-full object-cover" />
                  ) : (
                    (photo.user.name || photo.user.username).charAt(0).toUpperCase()
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-white font-semibold text-lg group-hover:text-[#D32F2F] transition-colors truncate">{photo.user.name || photo.user.username}</p>
                  <p className="text-neutral-500 text-sm truncate">@{photo.user.username}</p>
                </div>
                <svg className="w-5 h-5 text-neutral-600 group-hover:text-[#D32F2F] transition-colors flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </Link>

              {/* Caption */}
              {photo.caption && (
                <div className="bg-neutral-900 border border-neutral-800 p-4">
                  <p className="text-neutral-300 leading-relaxed">{photo.caption}</p>
                </div>
              )}

              {/* Details */}
              <div className="bg-neutral-900 border border-neutral-800 p-4 space-y-3">
                <div className="text-xs text-neutral-500 mb-3 uppercase tracking-wide">Details</div>

                {photo.takenDate && (
                  <div className="flex justify-between items-center">
                    <span className="text-neutral-500 text-sm">Taken</span>
                    <span className="text-white text-sm">
                      {new Date(photo.takenDate).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' })}
                    </span>
                  </div>
                )}

                <div className="flex justify-between items-center">
                  <span className="text-neutral-500 text-sm">Uploaded</span>
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
              </div>

              {/* Actions */}
              <div className="bg-neutral-900 border border-neutral-800 p-4 space-y-3">
                <a
                  href={photo.originalPath}
                  target="_blank"
                  className="block w-full text-center py-2.5 border border-neutral-700 text-neutral-300 text-sm hover:bg-white hover:text-black transition-colors font-medium"
                >
                  View Original
                </a>

                <WatermarkButton
                  photoId={photo.id}
                  camera={photo.camera?.name}
                  filmStock={photo.filmStock?.name}
                  takenDate={photo.takenDate ? photo.takenDate.toISOString() : null}
                />

                <div className="flex items-center gap-4 pt-3 border-t border-neutral-800">
                  <LikeButton photoId={photo.id} initialLiked={!!userLiked} initialCount={photo._count.likes} />
                  {isOwner && (
                    <>
                      <Link href={`/photos/${photo.id}/edit`} className="text-neutral-500 hover:text-white text-sm transition-colors font-medium">
                        Edit
                      </Link>
                      <DeleteButton photoId={photo.id} />
                    </>
                  )}
                </div>
              </div>

              {/* Comments */}
              <div className="bg-neutral-900 border border-neutral-800 p-4">
                <CommentSection photoId={photo.id} />
              </div>
            </div>
          </div>
        </div>

        {/* Related Photos */}
        {relatedPhotos.length > 0 && (
          <section className="border-t border-neutral-900 mt-8">
            <div className="max-w-7xl mx-auto px-4 md:px-6 py-12">
              <h2 className="text-lg font-bold text-white mb-6">More like this</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3">
                {relatedPhotos.map(p => (
                  <Link key={p.id} href={`/photos/${p.id}`} className="group relative aspect-[3/2] bg-neutral-900 overflow-hidden">
                    <Image src={p.thumbnailPath} alt="" fill className="object-cover group-hover:scale-105 transition-transform duration-300" sizes="(max-width: 768px) 50vw, 25vw" />
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
