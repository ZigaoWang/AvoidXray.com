import { prisma } from '@/lib/db'
import { randomSeed } from '@/lib/seededShuffle'
import type { RandomFeedRow } from '@/lib/photoFeed'
import Link from 'next/link'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import MasonryGrid from '@/components/MasonryGrid'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import type { Metadata } from 'next'
import { bylineUserSelect } from '@/lib/publicUser'
import { feedOrderBy, feedWhere, isFeedTab, type FeedTab } from '@/lib/photoFeed'
import { hiddenUserIds } from '@/lib/blocks'

export const metadata: Metadata = {
  title: 'Explore',
  description: 'Film photography uploaded by the AvoidXray community.',
  openGraph: {
    title: 'Explore – AvoidXray',
    description: 'Film photography uploaded by the AvoidXray community.',
    url: 'https://avoidxray.com/explore',
  },
  alternates: {
    canonical: 'https://avoidxray.com/explore',
  },
}

export const dynamic = 'force-dynamic'

export default async function ExplorePage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab = 'random' } = await searchParams
  const activeTab: FeedTab = isFeedTab(tab) ? tab : 'random'
  const session = await getServerSession(authOptions)
  const userId = (session?.user as { id?: string } | undefined)?.id

  const following = userId
    ? await prisma.follow.findMany({
        where: { followerId: userId },
        select: { followingId: true }
      })
    : []
  const followingIds = following.map(f => f.followingId)

  // A fresh order on every visit, which is what a Random tab is for.
  //
  // The seed is generated here and handed to the grid, which forwards it to
  // /api/photos as the reader scrolls, so the first screen and everything after
  // it come from one ordering. Without a shared seed the two disagreed and
  // MasonryGrid's dedupe silently dropped whatever appeared in both.
  //
  // Returning from a photo does not re-roll this: infinite mode restores the
  // exact photo list, offset and seed it cached before navigating away.
  const randomOrderSeed = randomSeed()
  const hidden = await hiddenUserIds(userId)

  let photos
  if (activeTab === 'random') {
    photos = await prisma.$queryRaw`
      SELECT p.*,
             json_build_object('username', u.username, 'name', u.name, 'avatar', u.avatar) as user,
             CASE WHEN f.id IS NULL THEN NULL
                  ELSE json_build_object('name', f.name, 'brand', f.brand, 'slug', f.slug) END as "filmStock",
             CASE WHEN c.id IS NULL THEN NULL
                  ELSE json_build_object('name', c.name, 'brand', c.brand, 'slug', c.slug) END as camera,
             (SELECT COUNT(*)::int FROM "Like" WHERE "photoId" = p.id) as likes_count
      FROM "Photo" p
      LEFT JOIN "User" u ON p."userId" = u.id
      LEFT JOIN "FilmStock" f ON p."filmStockId" = f.id
      LEFT JOIN "Camera" c ON p."cameraId" = c.id
      WHERE p.published = true AND p.visibility = 'public'
        AND (${hidden.length === 0} OR p."userId" <> ALL(${hidden}))
      ORDER BY md5(p.id || ${randomOrderSeed})
      LIMIT 21
    ` as RandomFeedRow[]

    // Transform to match expected format (blurHash is already in p.*)
    photos = photos.map(p => ({
      ...p,
      _count: { likes: p.likes_count }
    }))
  } else {
    // Ordering comes from the shared helper so this first screen cannot drift
    // from the pages /api/photos serves after it.
    photos = await prisma.photo.findMany({
      where: feedWhere(activeTab, followingIds, {}, hidden),
      include: { user: { select: bylineUserSelect }, filmStock: true, camera: true, _count: { select: { likes: true } } },
      orderBy: feedOrderBy(activeTab),
      take: 21
    })
  }

  const userLikes = userId ? await prisma.like.findMany({
    where: { userId, photoId: { in: photos.map(p => p.id) } },
    select: { photoId: true }
  }) : []
  const likedIds = new Set(userLikes.map(l => l.photoId))

  const hasMore = photos.length > 20
  const initialPhotos = (hasMore ? photos.slice(0, 20) : photos).map(p => ({ ...p, liked: likedIds.has(p.id) }))
  const nextOffset = hasMore ? 20 : null

  const tabs = [
    { id: 'random', label: 'Random' },
    { id: 'recent', label: 'Recent' },
    { id: 'popular', label: 'Popular' },
    ...(userId ? [{ id: 'following', label: 'Following' }] : [])
  ]

  return (
    <div className="min-h-dvh bg-[#0a0a0a] flex flex-col">
      <Header />

      <main className="flex-1">
        <div className="max-w-7xl mx-auto px-6 py-10">
          <h1 className="text-3xl font-black text-white mb-2 tracking-tight">Explore</h1>
          <p className="text-neutral-500 mb-8">Discover film photography</p>

          {/* aria-current, and a transparent border on the inactive tabs.
              Nothing carried which feed you were on except a red underline,
              and only the active tab had a border — so it sat 2px taller than
              its neighbours and the row of labels did not line up. */}
          <nav aria-label="Photo feeds" className="flex gap-4 border-b border-neutral-800 mb-8">
            {tabs.map(t => (
              <Link
                key={t.id}
                href={`/explore?tab=${t.id}`}
                aria-current={activeTab === t.id ? 'page' : undefined}
                className={`py-3 text-sm font-medium transition-colors border-b-2 ${
                  activeTab === t.id
                    ? 'text-white border-[#D32F2F]'
                    : 'text-neutral-500 hover:text-white border-transparent'
                }`}
              >
                {t.label}
              </Link>
            ))}
          </nav>

          <MasonryGrid
            initialPhotos={initialPhotos}
            initialOffset={nextOffset}
            tab={activeTab}
            seed={activeTab === 'random' ? randomOrderSeed : undefined}
            emptyMessage={activeTab === 'following' ? "No photos from people you follow yet" : "No photos yet"}
            emptyLink={activeTab === 'following' ? { href: '/explore?tab=random', text: 'Discover photographers to follow' } : undefined}
          />
        </div>
      </main>

      <Footer />
    </div>
  )
}
