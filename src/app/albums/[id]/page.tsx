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
import { OG_DEFAULT_IMAGE, SITE_URL } from '@/lib/seo/site'
import EmptyState, { PhotoIcon } from '@/components/ui/EmptyState'
import Badge from '@/components/ui/Badge'
import { ButtonLink } from '@/components/ui/Button'
import AlbumActions from '@/components/AlbumActions'
import { visibleToViewer } from '@/lib/photoVisibility'
import { ALBUM_TAB, albumPhotoPage, FEED_FIRST_PAGE, feedScopeQuery } from '@/lib/photoFeed'
import { visiblePhotoCountsByAlbum, withLikeCounts } from '@/lib/counts'

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params
  const album = await prisma.collection.findUnique({
    where: { id },
    select: {
      name: true,
      description: true,
      public: true,
      user: { select: { username: true, name: true } }
    }
  })

  // Don't expose metadata for private albums
  if (!album || !album.public) {
    return { title: 'Album Not Found', robots: { index: false, follow: false } }
  }

  const ownerName = album.user?.name || album.user?.username || 'Unknown'
  const title = `${album.name} by ${ownerName}`
  // Counted as a stranger would see it, like the discover listing: one
  // description is served to every viewer, so counting every row advertised a
  // number the page never shows and disclosed how many photos the album was
  // holding back. Counted only when an album has no description of its own,
  // which is the only thing this number feeds.
  let description = album.description
  if (!description) {
    const counts = await visiblePhotoCountsByAlbum([id], null)
    description = `Photo album with ${counts.get(id) ?? 0} photos by ${ownerName}`
  }

  return {
    title,
    description,
    openGraph: {
      title: `${album.name} – AvoidXray`,
      description,
      type: 'website',
      url: `${SITE_URL}/albums/${id}`,
      images: [OG_DEFAULT_IMAGE],
    },
    twitter: {
      card: 'summary',
      title,
      description,
    },
    alternates: { canonical: `${SITE_URL}/albums/${id}` },
  }
}

export default async function AlbumPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  const userId = session?.user ? (session.user as { id: string }).id : null

  // The membership list is no longer loaded with the album: it had no bound, so
  // opening an album meant hydrating every photo in it and serializing all of
  // them into the payload to render one screen.
  const album = await prisma.collection.findUnique({
    where: { id },
    include: {
      user: { select: { id: true, username: true, name: true, avatar: true } }
    }
  })

  if (!album) {
    notFound()
  }

  const isOwner = userId === album.userId

  // If album is not public and user is not the owner, return 404
  if (!album.public && !isOwner) {
    notFound()
  }

  // The album may be public while a photo inside it is not. The owner sees their
  // own private photos here; nobody else does.
  const visible = visibleToViewer(userId)

  // Only the first screen; MasonryGrid pages the rest through /api/photos,
  // which serves an album in the order its owner arranged rather than by date.
  // The total is still the album's whole visible count, because that is the
  // number both labels below report.
  const [photos, albumCounts] = await Promise.all([
    albumPhotoPage(album.id, visible, { take: FEED_FIRST_PAGE + 1 }),
    visiblePhotoCountsByAlbum([album.id], userId)
  ])
  const totalPhotos = albumCounts.get(album.id) ?? 0

  const hasMore = photos.length > FEED_FIRST_PAGE
  const firstPage = hasMore ? photos.slice(0, FEED_FIRST_PAGE) : photos

  // Like counts and the viewer's own likes, both restricted to the screen being
  // rendered rather than to the album.
  const [countedPhotos, userLikes] = await Promise.all([
    withLikeCounts(firstPage),
    userId ? prisma.like.findMany({
      where: { userId, photoId: { in: firstPage.map(photo => photo.id) } },
      select: { photoId: true }
    }) : []
  ])
  const likedIds = new Set(userLikes.map(l => l.photoId))

  const initialPhotos = countedPhotos.map(photo => ({ ...photo, liked: likedIds.has(photo.id) }))

  return (
    <div className="min-h-dvh bg-[#0a0a0a] flex flex-col">
      <Header />

      <main id="main-content" tabIndex={-1} className="flex-1 max-w-7xl mx-auto w-full py-8 md:py-16 px-4 md:px-6">
        <Link href={isOwner ? "/albums" : "/discover/albums"} className="text-neutral-500 hover:text-white text-sm mb-6 inline-block">
          &larr; {isOwner ? "My Albums" : "Discover Albums"}
        </Link>

        {/* Hero Section */}
        <div className="bg-gradient-to-br from-neutral-900 to-neutral-950 border border-neutral-800 overflow-hidden mb-8">
          <div className="p-6 md:p-8 lg:p-12">
            <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-6">
              <div className="flex-1">
                {/* The same title and visibility pair as the albums index, so
                    one album reads the same wherever you meet it. Shown only to
                    the owner: they are the one who set it and the one about to
                    send the link, and a stranger can only ever reach a public
                    album here, so the badge would tell them nothing. */}
                <div className="flex flex-wrap items-center gap-3 mb-4">
                  <h1 className="text-3xl md:text-4xl lg:text-5xl font-black text-white tracking-tight">
                    {album.name}
                  </h1>
                  {isOwner && (
                    <Badge tone={album.public ? 'success' : 'neutral'}>
                      {album.public ? 'Public' : 'Private'}
                    </Badge>
                  )}
                </div>

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
                    <span className="text-lg font-semibold">{totalPhotos} photos</span>
                  </div>
                </div>

                {/* Owner */}
                {album.user && (
                  <Link href={`/${album.user.username}`} className="inline-flex items-center gap-3 group bg-neutral-900/50 p-3 border border-neutral-800 hover:border-brand transition-colors">
                    <div className="w-10 h-10 bg-neutral-800 flex items-center justify-center text-white text-sm font-bold overflow-hidden">
                      {album.user.avatar ? (
                        <Image src={album.user.avatar} alt="" width={40} height={40} className="w-full h-full object-cover" />
                      ) : (
                        (album.user.name || album.user.username).charAt(0).toUpperCase()
                      )}
                    </div>
                    <div>
                      <p className="text-white text-sm font-medium group-hover:text-brand transition-colors">
                        {album.user.name || album.user.username}
                      </p>
                      <p className="text-neutral-500 text-xs">@{album.user.username}</p>
                    </div>
                  </Link>
                )}
              </div>

              {/* Laid out like the photo page's owner row: the photographs are
                  what this page is for, so nothing here takes the brand-red
                  fill. Edit stays the secondary it already was, and the rest —
                  Copy link, Delete — go in the same menu every other item on
                  the site carries, at the lowest weight of the three. */}
              {isOwner && (
                <div className="flex items-center gap-1">
                  <ButtonLink href={`/albums/${album.id}/edit`} variant="secondary">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                    Edit Album
                  </ButtonLink>
                  <AlbumActions
                    albumId={album.id}
                    albumName={album.name}
                    className="-mr-2"
                    afterDelete="/albums"
                  />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Photos */}
        <div>
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-white">Photos</h2>
            {totalPhotos > 0 && (
              <span className="text-neutral-500 text-sm">{totalPhotos} {totalPhotos === 1 ? 'photo' : 'photos'}</span>
            )}
          </div>

          {initialPhotos.length === 0 ? (
            <EmptyState
              icon={<PhotoIcon />}
              message="No photos in this album yet"
              action={isOwner ? { href: `/albums/${album.id}/edit`, label: 'Add photos' } : undefined}
            />
          ) : (
            // The album is the list being browsed, so prev/next on a photo
            // stay inside it instead of walking the whole site. ALBUM_TAB is
            // what asks /api/photos for the curated order rather than one of
            // the date and likes orderings the explore tabs page by.
            <MasonryGrid
              initialPhotos={initialPhotos}
              initialOffset={hasMore ? FEED_FIRST_PAGE : null}
              tab={ALBUM_TAB}
              scopeQuery={feedScopeQuery({ albumId: album.id })}
            />
          )}
        </div>
      </main>

      <Footer />
    </div>
  )
}
