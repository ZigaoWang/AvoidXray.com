import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/db'
import { Prisma } from '@prisma/client'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import Link from 'next/link'
import Image from 'next/image'
import type { Metadata } from 'next'
import { blurHashToDataURL } from '@/lib/blurhash'
import AlbumActions from '@/components/AlbumActions'

export const metadata: Metadata = {
  title: 'My Albums',
  description: 'Organize your photos into collections.',
}

export const dynamic = 'force-dynamic'

export default async function MyAlbumsPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    redirect('/login')
  }

  const userId = (session.user as { id: string }).id

  const albums = await prisma.collection.findMany({
    where: { userId },
    include: {
      _count: { select: { photos: true } }
    },
    orderBy: { createdAt: 'desc' }
  })

  // Get 4 random photos for each album using raw SQL
  const albumIds = albums.map(a => a.id)
  const randomPhotos = albumIds.length > 0 ? await prisma.$queryRaw<{ id: string; thumbnailPath: string; collectionId: string; blurHash: string | null }[]>`
    SELECT p.id, p."thumbnailPath", cp."collectionId", p."blurHash" FROM (
      SELECT cp.*, ROW_NUMBER() OVER (PARTITION BY cp."collectionId" ORDER BY RANDOM()) as rn
      FROM "CollectionPhoto" cp
      WHERE cp."collectionId" IN (${Prisma.join(albumIds)})
    ) cp
    JOIN "Photo" p ON cp."photoId" = p.id
    WHERE cp.rn <= 4
  ` : []

  // Group photos by album
  const photosByAlbum = new Map<string, typeof randomPhotos>()
  for (const photo of randomPhotos) {
    if (!photosByAlbum.has(photo.collectionId)) {
      photosByAlbum.set(photo.collectionId, [])
    }
    photosByAlbum.get(photo.collectionId)!.push(photo)
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex flex-col">
      <Header />

      <main className="flex-1 max-w-7xl mx-auto w-full py-16 px-6">
        <div className="flex items-center justify-between mb-12">
          <div>
            <h1 className="text-4xl font-black text-white mb-2 tracking-tight">My Albums</h1>
            <p className="text-neutral-500">Organize your photos into collections</p>
          </div>
          <Link
            href="/albums/create"
            className="px-5 py-2.5 bg-[#D32F2F] text-white text-sm font-bold uppercase tracking-wider hover:bg-[#B71C1C] transition-colors"
          >
            + Create Album
          </Link>
        </div>

        {albums.length === 0 ? (
          <div className="text-center py-24 border border-dashed border-neutral-800">
            <svg className="w-16 h-16 mx-auto mb-4 text-neutral-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
            <p className="text-neutral-500 mb-4">No albums yet</p>
            <Link
              href="/albums/create"
              className="inline-block px-5 py-2.5 bg-[#D32F2F] text-white text-sm font-bold uppercase tracking-wider hover:bg-[#B71C1C] transition-colors"
            >
              Create Your First Album
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {albums.map(album => {
              const photos = photosByAlbum.get(album.id) || []
              return (
                <div key={album.id} className="group bg-neutral-900 border border-neutral-800 hover:border-[#D32F2F] transition-colors overflow-hidden relative">
                  <Link href={`/albums/${album.id}`}>
                    {/* Photo Grid */}
                    <div className="grid grid-cols-4 gap-px bg-neutral-800">
                      {photos.slice(0, 4).map(photo => (
                        <div key={photo.id} className="aspect-square relative bg-neutral-900">
                          <Image
                            src={photo.thumbnailPath}
                            alt=""
                            fill
                            className="object-cover"
                            sizes="100px"
                            placeholder={photo.blurHash ? 'blur' : 'empty'}
                            blurDataURL={blurHashToDataURL(photo.blurHash)}
                          />
                        </div>
                      ))}
                      {Array.from({ length: Math.max(0, 4 - photos.length) }).map((_, i) => (
                        <div key={i} className="aspect-square bg-neutral-900 flex items-center justify-center">
                          <svg className="w-6 h-6 text-neutral-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                        </div>
                      ))}
                    </div>

                    {/* Info Section */}
                    <div className="p-4 flex items-center gap-4">
                      {/* Album Icon */}
                      <div className="w-16 h-16 flex-shrink-0 flex items-center justify-center bg-neutral-800 rounded">
                        <svg
                          className="w-8 h-8 text-neutral-600"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={1.5}
                            d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
                          />
                        </svg>
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="text-lg font-bold group-hover:text-[#D32F2F] transition-colors truncate">
                          {album.name}
                        </h3>
                        {album.description && (
                          <p className="text-neutral-500 text-sm truncate">{album.description}</p>
                        )}
                        <p className="text-neutral-500 text-sm">{album._count.photos} photos</p>
                      </div>
                    </div>
                  </Link>

                  {/* Edit/Delete Actions */}
                  <AlbumActions albumId={album.id} albumName={album.name} />
                </div>
              )
            })}
          </div>
        )}
      </main>

      <Footer />
    </div>
  )
}
