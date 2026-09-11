import { prisma } from '@/lib/db'
import { notFound } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import { sectionHeadingClass } from '@/components/ui/PageHeader'
import Image from 'next/image'
import Link from 'next/link'
import MasonryGrid from '@/components/MasonryGrid'
import type { Metadata } from 'next'
import { OG_DEFAULT_IMAGE, SITE_URL } from '@/lib/seo/site'
import EmptyState, { PhotoIcon } from '@/components/ui/EmptyState'
import Badge from '@/components/ui/Badge'
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

  // notFound() here as well as in the body, so the two agree about what is
  // missing — but be aware this does NOT fix the status on its own.
  //
  // Measured against this build (Next 16.3.4): a route carrying a loading.tsx
  // answers 200 for an unknown entry no matter where notFound() is called,
  // because the Suspense boundary flushes the shell before either call runs.
  // Blocking metadata does not help — forcing it through htmlLimitedBots moves
  // the title into <head> for a crawler and the status stays 200. Removing the
  // route's loading.tsx is what turns it into a real 404, at the cost of the
  // skeleton. Until that trade is made deliberately, this is a soft 404: the
  // page says Not Found and the status says otherwise.
  if (!album) notFound()

  // Don't expose metadata for private albums
  if (!album.public) {
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

        {/* Opened like the film and camera pages: the name at the hub scale,
            then quiet lines under it and no panel around any of it. An album
            has no cover image to fill a hero, so the gradient box was mostly
            padding, and the masonry below is the content anyway. */}
        <div className="flex items-start justify-between gap-4 mb-8">
          <div className="min-w-0">
            {/* The same title and visibility pair as the albums index, so one
                album reads the same wherever you meet it. Shown only to the
                owner: they are the one who set it and the one about to send
                the link, and a stranger can only ever reach a public album
                here, so the badge would tell them nothing. */}
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-3xl md:text-4xl font-black text-white tracking-tight leading-tight">
                {album.name}
              </h1>
              {isOwner && (
                <Badge tone={album.public ? 'success' : 'neutral'}>
                  {album.public ? 'Public' : 'Private'}
                </Badge>
              )}
            </div>

            {album.description && (
              <p className="mt-3 max-w-2xl text-base leading-relaxed text-neutral-200">
                {album.description}
              </p>
            )}

            {/* Who made it and how big it is, on one line. Both were boxed
                before — the owner in a bordered card, the count in a row of
                its own with a 20px icon — which gave two asides more weight
                than the album's name. */}
            <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1">
              {album.user && (
                <>
                  <Link href={`/${album.user.username}`} className="group inline-flex items-center gap-2">
                    <span className="w-6 h-6 bg-neutral-800 rounded-full flex items-center justify-center text-white text-[10px] font-bold overflow-hidden">
                      {album.user.avatar ? (
                        <Image src={album.user.avatar} alt="" width={24} height={24} className="w-full h-full object-cover" />
                      ) : (
                        (album.user.name || album.user.username).charAt(0).toUpperCase()
                      )}
                    </span>
                    <span className="text-sm text-neutral-300 group-hover:text-white transition-colors">
                      {album.user.name || album.user.username}
                    </span>
                    <span className="text-sm text-neutral-500">@{album.user.username}</span>
                  </Link>
                  <span aria-hidden className="text-neutral-700">·</span>
                </>
              )}
              <span className="text-xs text-neutral-500">
                {totalPhotos} {totalPhotos === 1 ? 'photo' : 'photos'}
              </span>
            </div>
          </div>

          {/* One control, as on the albums index: Edit album was both a button
              here and an item in this menu, and the two boxes were different
              heights. Copy link, Edit and Delete all live in the menu, which
              is where every other item on the site keeps them. */}
          {isOwner && (
            <AlbumActions
              albumId={album.id}
              albumName={album.name}
              className="-mr-2 shrink-0"
              afterDelete="/albums"
            />
          )}
        </div>

        {/* Photos */}
        <div>
          <div className="flex items-center justify-between mb-6">
            <h2 className={sectionHeadingClass}>Photos</h2>
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
