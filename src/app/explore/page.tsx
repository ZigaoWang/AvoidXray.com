import { prisma } from '@/lib/db'
import { randomSeed } from '@/lib/seededShuffle'
import type { RandomFeedRow } from '@/lib/photoFeed'
import Link from 'next/link'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import PageHeader from '@/components/ui/PageHeader'
import MasonryGrid from '@/components/MasonryGrid'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import type { Metadata } from 'next'
import { bylineUserSelect } from '@/lib/publicUser'
import { feedOrderBy, feedWhere, isFeedTab, RANDOM_FEED_SELECT, type FeedTab } from '@/lib/photoFeed'
import { withLikeCounts } from '@/lib/counts'
import { hiddenUserIds } from '@/lib/blocks'
import { OG_DEFAULT_IMAGE } from '@/lib/seo/site'

export const metadata: Metadata = {
  title: 'Explore',
  description: 'Film photography uploaded by the AvoidXray community.',
  openGraph: {
    title: 'Explore – AvoidXray',
    description: 'Film photography uploaded by the AvoidXray community.',
    url: 'https://avoidxray.com/explore',
      images: [OG_DEFAULT_IMAGE],
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
    const rows = await prisma.$queryRaw`
      ${RANDOM_FEED_SELECT}
      WHERE p.published = true AND p.visibility = 'public'
        AND (${hidden.length === 0} OR p."userId" <> ALL(${hidden}))
      ORDER BY md5(p.id || ${randomOrderSeed})
      LIMIT 21
    ` as RandomFeedRow[]
    photos = await withLikeCounts(rows)
  } else {
    // Ordering comes from the shared helper so this first screen cannot drift
    // from the pages /api/photos serves after it.
    const rows = await prisma.photo.findMany({
      where: feedWhere(activeTab, followingIds, {}, hidden),
      include: {
      user: { select: bylineUserSelect },
      // Narrowed to what the grid reads. `filmStock: true, camera: true`
      // shipped all 33 and 41 columns per photo, summary and the
      // multi-paragraph description included, thirty times a scroll page --
      // about nine times the bytes for the same rendering. `manufacturer` is
      // in the list because displayName prefers it over brand for a film, and
      // dropping it would quietly change the alt text, which is the only
      // thing describing a scan to an image crawler.
      filmStock: { select: { name: true, brand: true, manufacturer: true } },
      camera: { select: { name: true, brand: true } },
    },
      orderBy: feedOrderBy(activeTab),
      take: 21
    })
    photos = await withLikeCounts(rows)
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

      <main id="main-content" tabIndex={-1} className="flex-1">
        <div className="max-w-7xl mx-auto px-6 py-10 md:py-16">
          <PageHeader title="Explore" description="Every frame on the site, newest first." />

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
                    ? 'text-white border-brand'
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
