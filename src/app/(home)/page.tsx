import { prisma } from '@/lib/db'
import Header from '@/components/Header'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import HeroSection from '@/components/HeroSection'
import type { MasonryItem } from '@/components/HeroMasonry'
import type { Metadata } from 'next'
import { OG_BASE, OG_DEFAULT_IMAGE, SITE_URL } from '@/lib/seo/site'
import Link from 'next/link'
import PhotoStrip from '@/components/PhotoStrip'
import { sectionHeadingClass } from '@/components/ui/PageHeader'
import { hiddenUserIds } from '@/lib/blocks'
import { recentMix, type RelatedPhoto } from '@/lib/relatedPhotos'
import { heroPools, siteCounts } from '@/lib/publicCache'
import PageShell from '@/components/PageShell'

export const dynamic = 'force-dynamic'

const description =
  'Film photography organized by film stock and camera. Unedited scans of Kodak, Fujifilm, Ilford and CineStill stocks, uploaded by the people who shot them.'

export const metadata: Metadata = {
  // Absolute, or the root layout's "%s – AvoidXray" template appends the brand
  // to a title that already ends in it: "AvoidXray – Film Photography
  // Community – AvoidXray". The template is right for every other page and
  // wrong for the one whose title is the site's own name.
  title: { absolute: 'AvoidXray – Film Photography Community' },
  description,
  keywords: [
    'film photography',
    'film stock sample photos',
    '35mm film samples',
    'film camera sample photos',
    'analog photography community',
    'shot on film',
  ],
  alternates: { canonical: SITE_URL },
  openGraph: {
    ...OG_BASE,
    title: 'AvoidXray – Film Photography Community',
    description,
    url: SITE_URL,
    images: [OG_DEFAULT_IMAGE],
  },
}

/**
 * How many photos the hero shows, and how deep a pool it shuffles them out of.
 *
 * The pool exists so the collage differs between visits without the page
 * having to load the whole archive to do it. Four hundred is wide enough that
 * repeat visits rarely repeat a layout, and bounded so the query cost stops
 * tracking the size of the gallery.
 */
/** Tiles in the signed-in reader's latest row: two rows of four. */
const LATEST_COUNT = 8

const HERO_PHOTOS = 100
const HERO_PHOTO_POOL = 400

/**
 * Gear tiles are mixed in one per five photos, so the hero shows at most
 * HERO_GEAR of each. The pool is wider than that for the same reason as the
 * photo pool: shuffling a list the same size as the slice is not a shuffle.
 */
const HERO_GEAR = 20
const HERO_GEAR_POOL = 80

// Fisher-Yates shuffle
function shuffle<T>(array: T[]): T[] {
  const shuffled = [...array]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }
  return shuffled
}

export default async function Home() {
  const session = await getServerSession(authOptions)

  // Shared between visits; see publicCache. The shuffle below still runs per
  // visit, so the collage differs each time.
  const [
    { photos: photoPool, films: filmStocks, cameras },
    { photos: totalPhotos, films: totalFilms, cameras: totalCameras },
  ] = await Promise.all([heroPools(HERO_PHOTO_POOL, HERO_GEAR_POOL), siteCounts()])

  // Shuffle everything - get MORE items for impressive density
  // For a signed-in reader, what is new from the people they follow, or from
  // everyone when they follow nobody or nobody they follow has posted. The
  // front page was the same collage for them as for a stranger.
  const viewerId = (session?.user as { id?: string } | undefined)?.id
  let latest: { heading: string; href: string; photos: RelatedPhoto[] } | null = null
  if (viewerId) {
    const [follows, hidden] = await Promise.all([
      prisma.follow.findMany({ where: { followerId: viewerId }, select: { followingId: true } }),
      hiddenUserIds(viewerId),
    ])
    const fromFollowing = follows.length > 0
      ? await recentMix({ fromUserIds: follows.map(f => f.followingId), hidden, take: LATEST_COUNT })
      : []
    latest = fromFollowing.length > 0
      ? { heading: 'Recently from people you follow', href: '/explore?tab=following', photos: fromFollowing }
      : { heading: 'Recently on AvoidXray', href: '/explore?tab=recent', photos: await recentMix({ hidden, take: LATEST_COUNT }) }
  }

  const shuffledPhotos = shuffle(photoPool).slice(0, HERO_PHOTOS).map(p => ({ ...p, type: 'photo' as const }))
  const shuffledFilms = shuffle(filmStocks).slice(0, HERO_GEAR).map(f => ({ ...f, type: 'film' as const }))
  const shuffledCameras = shuffle(cameras).slice(0, HERO_GEAR).map(c => ({ ...c, type: 'camera' as const }))

  // Mix them together - alternate film and camera, spread evenly
  const mixedItems: MasonryItem[] = []
  let filmIndex = 0
  let cameraIndex = 0
  let useFilm = true // alternate between film and camera

  shuffledPhotos.forEach((photo, i) => {
    mixedItems.push(photo)
    // Insert film or camera every 5 photos, alternating
    if ((i + 1) % 5 === 0) {
      if (useFilm && filmIndex < shuffledFilms.length) {
        mixedItems.push(shuffledFilms[filmIndex])
        filmIndex++
      } else if (!useFilm && cameraIndex < shuffledCameras.length) {
        mixedItems.push(shuffledCameras[cameraIndex])
        cameraIndex++
      } else if (filmIndex < shuffledFilms.length) {
        mixedItems.push(shuffledFilms[filmIndex])
        filmIndex++
      } else if (cameraIndex < shuffledCameras.length) {
        mixedItems.push(shuffledCameras[cameraIndex])
        cameraIndex++
      }
      useFilm = !useFilm
    }
  })

  return (
    <PageShell header={<Header />}>

      {/* The front page was the one page with no main landmark at all, so it
          had nothing for "Skip to content" to reach and nothing for a screen
          reader to jump to. */}
      <main id="main-content" tabIndex={-1} className="flex-1 outline-none">
        <HeroSection
          items={mixedItems}
          totalPhotos={totalPhotos}
          totalFilms={totalFilms}
          totalCameras={totalCameras}
          isLoggedIn={!!session}
        />

        {latest && latest.photos.length > 0 && (
          <section className="max-w-7xl mx-auto px-6 py-12">
            <div className="flex items-baseline justify-between gap-4 mb-6">
              <h2 className={sectionHeadingClass}>{latest.heading}</h2>
              <Link href={latest.href} className="text-neutral-500 hover:text-brand text-sm transition-colors flex-shrink-0">
                See all &rarr;
              </Link>
            </div>
            <PhotoStrip photos={latest.photos} />
          </section>
        )}
      </main>

    </PageShell>
  )
}
