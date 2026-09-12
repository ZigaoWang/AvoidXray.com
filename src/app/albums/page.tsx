import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/db'
import { previewPhotosByAlbum, groupPreviews, ANY_PHOTO } from '@/lib/previewPhotos'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import PageHeader from '@/components/ui/PageHeader'
import Link from 'next/link'
import type { Metadata } from 'next'
import AlbumActions from '@/components/AlbumActions'
import AlbumCard from '@/components/AlbumCard'
import EmptyState from '@/components/ui/EmptyState'
import Badge from '@/components/ui/Badge'
import { ButtonLink } from '@/components/ui/Button'

export const metadata: Metadata = {
  title: 'Your albums',
  description: 'Organize your photos into collections.',
  // Auth-gated: redirects to /login for anyone else, so there is nothing here
  // worth indexing.
  robots: { index: false, follow: false },
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

  // No visibility filter: this page is the photographer looking at their own
  // albums, where their own unpublished and private frames belong.
  const photosByAlbum = groupPreviews(
    await previewPhotosByAlbum({ albumIds: albums.map((a) => a.id), where: ANY_PHOTO }),
    'collectionId'
  )

  return (
    <div className="min-h-dvh bg-[#0a0a0a] flex flex-col">
      <Header />

      <main id="main-content" tabIndex={-1} className="flex-1 max-w-7xl mx-auto w-full py-10 md:py-16 px-6">
        {/* The same header and tabs as /manage, so photos and albums read as
            two views of one area rather than two unrelated pages. */}
        <PageHeader title="Your work" description="Group photos into collections to share as a set." />

        <div className="flex gap-4 border-b border-neutral-800 mb-8 items-center">
          <Link href="/manage" className="py-3 text-sm font-medium text-neutral-500 hover:text-white transition-colors">
            Photos
          </Link>
          <span className="py-3 text-sm font-medium text-white border-b-2 border-brand -mb-px">
            Albums
          </span>
          <div className="ml-auto pb-1">
            <ButtonLink href="/albums/create" size="sm">+ Create Album</ButtonLink>
          </div>
        </div>

        {albums.length === 0 ? (
          <EmptyState
            icon={
              <svg className="h-16 w-16" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
            }
            message="No albums yet"
            action={{ href: '/albums/create', label: 'Create your first album' }}
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {albums.map((album, cardIndex) => (
              <AlbumCard
                key={album.id}
                album={album}
                previews={photosByAlbum.get(album.id) ?? []}
                photoCount={album._count.photos}
                cardIndex={cardIndex}
                badge={
                  <Badge tone={album.public ? 'success' : 'neutral'}>
                    {album.public ? 'Public' : 'Private'}
                  </Badge>
                }
                // Copy link, edit and delete, in the same menu every other
                // item on the site uses.
                actions={<AlbumActions albumId={album.id} albumName={album.name} />}
              />
            ))}
          </div>
        )}
      </main>

      <Footer />
    </div>
  )
}
