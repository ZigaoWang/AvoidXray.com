import { prisma } from '@/lib/db'
import { Prisma } from '@prisma/client'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import Link from 'next/link'
import Image from 'next/image'
import type { Metadata } from 'next'
import { blurPlaceholder, BLUR_SIZE, CARD_PREVIEW_BLUR_COUNT } from '@/lib/blurhash'
import { SITE_URL } from '@/lib/seo/site'
import { PUBLIC_PHOTO } from '@/lib/photoVisibility'

export const metadata: Metadata = {
  title: 'Discover Albums',
  description:
    'Browse public film photography albums from the AvoidXray community. Themed sets shot on 35mm and medium format.',
  alternates: { canonical: `${SITE_URL}/discover/albums` },
}

export const dynamic = 'force-dynamic'

export default async function DiscoverAlbumsPage() {
  const albums = await prisma.collection.findMany({
    where: { public: true },
    include: {
      user: { select: { id: true, username: true, name: true, avatar: true } },
      // Counts only what a stranger can see, matching the previews below and
      // the album page itself. Counting every row advertised a photo count
      // nobody browsing here could reach, and disclosed how many photos an
      // album was holding back.
      _count: { select: { photos: { where: { photo: PUBLIC_PHOTO } } } }
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
    -- A public album can still contain a private photo; the preview strangers
    -- see must not include it. Unpublished drafts are excluded for the same
    -- reason.
    WHERE cp.rn <= 4 AND p.published = true AND p.visibility = 'public'
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
    <div className="min-h-dvh bg-[#0a0a0a] flex flex-col">
      <Header />

      <main className="flex-1 max-w-7xl mx-auto w-full py-16 px-6">
        <div className="mb-12">
          <h1 className="text-4xl font-black text-white mb-2 tracking-tight">Discover Albums</h1>
          <p className="text-neutral-500">Photo collections put together by the community</p>
        </div>

        {albums.length === 0 ? (
          <div className="text-center py-24 border border-dashed border-neutral-800">
            <svg className="w-16 h-16 mx-auto mb-4 text-neutral-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
            <p className="text-neutral-500">No public albums yet</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {albums.map((album, cardIndex) => {
              const photos = photosByAlbum.get(album.id) || []
              return (
                <div key={album.id} className="group bg-neutral-900 border border-neutral-800 hover:border-[#D32F2F] transition-colors overflow-hidden">
                  <Link href={`/albums/${album.id}`}>
                    {/* Photo Grid */}
                    <div className="grid grid-cols-4 gap-px bg-neutral-800">
                      {photos.slice(0, 4).map((photo, previewIndex) => (
                        <div key={photo.id} className="aspect-square relative bg-neutral-900">
                          <Image
                            src={photo.thumbnailPath}
                            alt={`Film photograph from the album ${album.name}`}
                            fill
                            className="object-cover"
                            sizes="100px"
                            {...blurPlaceholder(
                              photo.blurHash,
                              cardIndex * 4 + previewIndex,
                              CARD_PREVIEW_BLUR_COUNT,
                              BLUR_SIZE.tile
                            )}
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
                    <div className="p-4 pb-2">
                      <h3 className="text-lg font-bold group-hover:text-[#D32F2F] transition-colors truncate">
                        {album.name}
                      </h3>
                      {album.description && (
                        <p className="text-neutral-500 text-sm truncate mt-1">{album.description}</p>
                      )}
                      <p className="text-neutral-500 text-sm mt-1">{album._count.photos} photos</p>
                    </div>
                  </Link>
                  {album.user && (
                    <Link href={`/${album.user.username}`} className="flex items-center gap-2 px-4 pb-4 hover:opacity-80 transition-opacity">
                      <div className="w-5 h-5 bg-neutral-800 flex items-center justify-center text-white text-xs font-bold overflow-hidden rounded-full">
                        {album.user.avatar ? (
                          <Image src={album.user.avatar} alt={`${album.user.name || album.user.username} avatar`} width={20} height={20} className="w-full h-full object-cover" />
                        ) : (
                          (album.user.name || album.user.username).charAt(0).toUpperCase()
                        )}
                      </div>
                      <span className="text-neutral-400 text-sm hover:text-white transition-colors">@{album.user.username}</span>
                    </Link>
                  )}
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
