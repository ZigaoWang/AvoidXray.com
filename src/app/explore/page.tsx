import { prisma } from '@/lib/db'
import { randomSeed } from '@/lib/seededShuffle'
import type { RandomFeedRow } from '@/lib/photoFeed'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import PageHeader from '@/components/ui/PageHeader'
import MasonryGrid from '@/components/MasonryGrid'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import type { Metadata } from 'next'
import { bylineUserSelect } from '@/lib/publicUser'
import { feedOrderBy, feedScopeQuery, feedWhere, isFeedPeriod, isFeedTab, RANDOM_FEED_SELECT, type FeedPeriod, type FeedScope, type FeedTab } from '@/lib/photoFeed'
import { withLikeCounts } from '@/lib/counts'
import { hiddenUserIds } from '@/lib/blocks'
import { OG_BASE, OG_DEFAULT_IMAGE } from '@/lib/seo/site'
import UnderlineTabs from '@/components/ui/UnderlineTabs'
import SegmentedLinks from '@/components/ui/SegmentedLinks'
import SuggestedPhotographers from '@/components/SuggestedPhotographers'

const description = 'Film photographs from the AvoidXray community, each tagged with the film stock and camera it was shot on.'

export const metadata: Metadata = {
  title: 'Explore',
  description,
  openGraph: {
    ...OG_BASE,
    title: 'Explore – AvoidXray',
    description,
    url: 'https://avoidxray.com/explore',
      images: [OG_DEFAULT_IMAGE],
    },
  alternates: {
    canonical: 'https://avoidxray.com/explore',
  },
}

export const dynamic = 'force-dynamic'

/** Popular's windows, most recent first. All time is the default. */
const PERIODS: { value: FeedPeriod | 'all'; label: string; description: string }[] = [
  { value: 'week', label: 'This week', description: 'Photos posted this week, most liked first.' },
  { value: 'month', label: 'This month', description: 'Photos posted this month, most liked first.' },
  { value: 'year', label: 'This year', description: 'Photos posted this year, most liked first.' },
  { value: 'all', label: 'All time', description: 'Every photo on the site, most liked first.' },
]

export default async function ExplorePage({ searchParams }: { searchParams: Promise<{ tab?: string; period?: string }> }) {
  const { tab = 'random', period: periodParam } = await searchParams
  const session = await getServerSession(authOptions)
  const userId = (session?.user as { id?: string } | undefined)?.id
  // Following needs an account. Signed out, a shared link to it showed "No
  // photos from people you follow yet" under a tab row that did not list it.
  const activeTab: FeedTab = isFeedTab(tab) && (tab !== 'following' || userId) ? tab : 'random'
  // Popular over all time is the same few photos on every visit; a window
  // lets newer work reach the top.
  const period = activeTab === 'popular' && isFeedPeriod(periodParam) ? periodParam : null
  const scope: FeedScope = period ? { period } : {}

  const [following, hidden] = await Promise.all([
    userId
      ? prisma.follow.findMany({
          where: { followerId: userId },
          select: { followingId: true }
        })
      : [],
    hiddenUserIds(userId),
  ])
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
      where: feedWhere(activeTab, followingIds, scope, hidden),
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

  // The header names the order the grid below is actually in, which changes
  // with the tab.
  const descriptions: Record<FeedTab, string> = {
    random: 'Every photo on the site, shuffled on each visit.',
    recent: 'Every photo on the site, newest first.',
    popular: PERIODS.find(p => p.value === (period ?? 'all'))!.description,
    following: 'Frames from the photographers you follow, newest first.',
  }

  return (
    <div className="min-h-dvh bg-[#0a0a0a] flex flex-col">
      <Header />

      <main id="main-content" tabIndex={-1} className="flex-1">
        <div className="max-w-7xl mx-auto px-6 py-10 md:py-16">
          <PageHeader title="Explore" description={descriptions[activeTab]} />
          <UnderlineTabs
            label="Photo feeds"
            tabs={tabs.map(t => ({ href: `/explore?tab=${t.id}`, label: t.label, current: activeTab === t.id }))}
          />

          {activeTab === 'popular' && (
            <div className="mb-6">
              <SegmentedLinks
                label="Posted"
                options={PERIODS}
                active={period ?? 'all'}
                hrefFor={value => (value === 'all' ? '/explore?tab=popular' : `/explore?tab=popular&period=${value}`)}
              />
            </div>
          )}

          <MasonryGrid
            initialPhotos={initialPhotos}
            initialOffset={nextOffset}
            tab={activeTab}
            seed={activeTab === 'random' ? randomOrderSeed : undefined}
            scopeQuery={feedScopeQuery(scope)}
            emptyMessage={
              activeTab === 'following' ? 'No photos from people you follow yet'
              : period ? `No photos posted ${PERIODS.find(p => p.value === period)!.label.toLowerCase()}`
              : 'No photos yet'
            }
            emptyLink={
              activeTab === 'following' && followingIds.length > 0 ? { href: '/explore?tab=random', text: 'Browse every photo' }
              : period ? { href: '/explore?tab=popular', text: 'See all time' }
              : undefined
            }
          />

          {activeTab === 'following' && userId && initialPhotos.length === 0 && (
            <SuggestedPhotographers viewerId={userId} exclude={[...followingIds, ...hidden]} />
          )}
        </div>
      </main>

      <Footer />
    </div>
  )
}
