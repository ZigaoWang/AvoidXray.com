import { prisma } from '@/lib/db'
import { notFound } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import Image from 'next/image'
import Link from 'next/link'
import MasonryGrid from '@/components/MasonryGrid'
import type { Metadata } from 'next'

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params
  const album = await prisma.collection.findUnique({
    where: { id },
    include: {
      user: { select: { username: true, name: true } },
      _count: { select: { photos: true } }
    }
  })

  if (!album) {
    return { title: 'Album Not Found' }
  }

  const ownerName = album.user?.name || album.user?.username || 'Unknown'
  const title = `${album.name} by ${ownerName}`
  const description = album.description || `Photo album with ${album._count.photos} photos by ${ownerName}`

  return {
    title,
    description,
    openGraph: {
      title: `${album.name} – AvoidXray`,
      description,
      type: 'website',
      url: `https://avoidxray.com/albums/${id}`,
    },
    twitter: {
      card: 'summary',
      title,
      description,
    },
  }
}

export default async function AlbumPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  const userId = session?.user ? (session.user as { id: string }).id : null

  const album = await prisma.collection.findUnique({
    where: { id },
    include: {
      photos: {
        include: {
          photo: {
            select: {
              id: true,
              thumbnailPath: true,
              width: true,
              height: true,
              blurHash: true,
              _count: { select: { likes: true } }
            }
          }
        },
        orderBy: { order: 'asc' }
      },
      user: { select: { id: true, username: true, name: true, avatar: true } },
      _count: { select: { photos: true } }
    }
  })

  if (!album) {
    notFound()
  }

  const isOwner = userId === album.userId

  // Get user's likes for photos in this album
  const photoIds = album.photos.map(cp => cp.photo.id)
  const userLikes = userId ? await prisma.like.findMany({
    where: { userId, photoId: { in: photoIds } },
    select: { photoId: true }
  }) : []
  const likedIds = new Set(userLikes.map(l => l.photoId))

  // Transform photos for MasonryGrid
  const photos = album.photos.map(cp => ({
    id: cp.photo.id,
    thumbnailPath: cp.photo.thumbnailPath,
    width: cp.photo.width,
    height: cp.photo.height,
    blurHash: cp.photo.blurHash,
    liked: likedIds.has(cp.photo.id),
    _count: cp.photo._count
  }))

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex flex-col">
      <Header />

      <main className="flex-1 max-w-7xl mx-auto w-full py-8 md:py-16 px-4 md:px-6">
        <Link href="/albums" className="text-neutral-500 hover:text-white text-sm mb-6 inline-block">
          &larr; My Albums
        </Link>

        {/* Hero Section */}
        <div className="bg-gradient-to-br from-neutral-900 to-neutral-950 border border-neutral-800 overflow-hidden mb-8">
          <div className="p-6 md:p-8 lg:p-12">
            <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-6">
              <div className="flex-1">
                <h1 className="text-3xl md:text-4xl lg:text-5xl font-black text-white mb-4 tracking-tight">
                  {album.name}
                </h1>

                {album.description && (
                  <p className="text-neutral-300 text-lg mb-6 leading-relaxed">
                    {album.description}
                  </p>
                )}

                <div className="flex items-center gap-4 text-neutral-400 mb-6">
                  <div className="flex items-center gap-2">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <span className="text-lg font-semibold">{album._count.photos} photos</span>
                  </div>
                </div>

                {/* Owner */}
                {album.user && (
                  <Link href={`/${album.user.username}`} className="inline-flex items-center gap-3 group bg-neutral-900/50 p-3 border border-neutral-800 hover:border-[#D32F2F] transition-colors">
                    <div className="w-10 h-10 bg-neutral-800 flex items-center justify-center text-white text-sm font-bold overflow-hidden">
                      {album.user.avatar ? (
                        <Image src={album.user.avatar} alt="" width={40} height={40} className="w-full h-full object-cover" />
                      ) : (
                        (album.user.name || album.user.username).charAt(0).toUpperCase()
                      )}
                    </div>
                    <div>
                      <p className="text-white text-sm font-medium group-hover:text-[#D32F2F] transition-colors">
                        {album.user.name || album.user.username}
                      </p>
                      <p className="text-neutral-500 text-xs">@{album.user.username}</p>
                    </div>
                  </Link>
                )}
              </div>

              {isOwner && (
                <Link
                  href={`/albums/${album.id}/edit`}
                  className="px-5 py-2.5 bg-neutral-800 text-white text-sm font-bold uppercase tracking-wider hover:bg-neutral-700 transition-colors inline-flex items-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                  Edit Album
                </Link>
              )}
            </div>
          </div>
        </div>

        {/* Photos */}
        <div>
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-white">Photos</h2>
            {photos.length > 0 && (
              <span className="text-neutral-500 text-sm">{photos.length} {photos.length === 1 ? 'photo' : 'photos'}</span>
            )}
          </div>

          {photos.length === 0 ? (
            <div className="text-center py-24 border border-dashed border-neutral-800 rounded">
              <svg className="w-16 h-16 text-neutral-700 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <p className="text-neutral-500 mb-4">No photos in this album yet</p>
              {isOwner && (
                <Link
                  href={`/albums/${album.id}/edit`}
                  className="inline-block px-5 py-2.5 bg-[#D32F2F] text-white text-sm font-bold uppercase tracking-wider hover:bg-[#B71C1C] transition-colors"
                >
                  Add Photos
                </Link>
              )}
            </div>
          ) : (
            <MasonryGrid photos={photos} />
          )}
        </div>
      </main>

      <Footer />
    </div>
  )
}
