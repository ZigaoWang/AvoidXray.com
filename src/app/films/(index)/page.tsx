import { prisma } from '@/lib/db'
import { Prisma } from '@prisma/client'
import { previewPhotosByGear, groupPreviews, VISIBLE_TO_ANYONE, notHidden } from '@/lib/previewPhotos'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import PageHeader from '@/components/ui/PageHeader'
import AddFilmButton from '@/components/AddFilmButton'
import type { Metadata } from 'next'
import JsonLd from '@/components/JsonLd'
import { GearBrowseCard } from '@/components/GearCard'
import { canonicalFilmPath } from '@/lib/seo/resolve'
import { breadcrumbJsonLd } from '@/lib/seo/jsonld'
import BrowseFilters from '@/components/BrowseFilters'
import EmptyState, { FilmIcon } from '@/components/ui/EmptyState'
import { COLOR_BALANCES, FILM_PROCESSES, colorBalanceLabel, filmProcessLabel, toColorBalance, toFilmProcess } from '@/lib/filmFields'
import { PUBLIC_PHOTO } from '@/lib/photoVisibility'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { hiddenUserIds, hiddenFilter } from '@/lib/blocks'
import { OG_DEFAULT_IMAGE } from '@/lib/seo/site'

export const metadata: Metadata = {
  title: 'Film Stocks',
  description: 'Photos organized by film stock, uploaded by the AvoidXray community.',
  openGraph: {
    title: 'Film Stocks – AvoidXray',
    description: 'Photos organized by film stock, uploaded by the AvoidXray community.',
    url: 'https://avoidxray.com/films',
      images: [OG_DEFAULT_IMAGE],
    },
  alternates: {
    canonical: 'https://avoidxray.com/films',
  },
}

export const dynamic = 'force-dynamic'

export default async function FilmsPage({
  searchParams,
}: {
  searchParams: Promise<{ process?: string; balance?: string }>
}) {
  const { process: processParam, balance: balanceParam } = await searchParams
  const process = toFilmProcess(processParam)
  const colorBalance = toColorBalance(balanceParam)

  // The block rule, which the film and camera detail pages already apply and
  // this index did not: a blocked account's photograph still turned up in the
  // preview strip on a card, and in the count printed under it.
  const session = await getServerSession(authOptions)
  const hidden = await hiddenUserIds((session?.user as { id?: string } | undefined)?.id)

  // Counts come from the unfiltered set, so a filter chip still shows how many
  // it would match while another filter is active.
  const [filmStocks, processCounts, balanceCounts] = await Promise.all([
    prisma.filmStock.findMany({
      where: {
        ...(process ? { process } : {}),
        ...(colorBalance ? { colorBalance } : {}),
      },
      // Selected, not included. `include` fetches every column, so this page
      // pulled each stock's description, summary, aliases and its measured
      // spec columns in order to draw a name, an ISO and a photo count.
      select: {
        id: true,
        slug: true,
        name: true,
        brand: true,
        manufacturer: true,
        iso: true,
        imageUrl: true,
        imageStatus: true,
        _count: { select: { photos: { where: { ...PUBLIC_PHOTO, ...hiddenFilter(hidden) } } } },
      },
      orderBy: { name: 'asc' }
    }),
    prisma.filmStock.groupBy({ by: ['process'], _count: { _all: true } }),
    prisma.filmStock.groupBy({ by: ['colorBalance'], _count: { _all: true } }),
  ])

  const counts = {
    process: Object.fromEntries(
      processCounts
        .filter((row) => row.process !== null)
        .map((row) => [filmProcessLabel(row.process)!, row._count._all])
    ),
    balance: Object.fromEntries(
      balanceCounts
        .filter((row) => row.colorBalance !== null)
        .map((row) => [colorBalanceLabel(row.colorBalance)!, row._count._all])
    ),
  }

  // Four photos for each stock, shuffled so the strip is an invitation to
  // browse rather than a record of the most recent upload.
  const photosByFilm = groupPreviews(
    await previewPhotosByGear({
      key: 'filmStockId',
      parents: filmStocks.map((f) => f.id),
      where: Prisma.sql`${VISIBLE_TO_ANYONE} ${notHidden(hidden)}`,
      order: 'random',
    }),
    'filmStockId'
  )

  return (
    <div className="min-h-dvh bg-[#0a0a0a] flex flex-col">
      <JsonLd
        data={breadcrumbJsonLd([
          { name: 'Home', path: '/' },
          { name: 'Film Stocks', path: '/films' },
        ])}
      />
      <Header />

      <main id="main-content" tabIndex={-1} className="flex-1 max-w-7xl mx-auto w-full py-10 md:py-16 px-6">
        <PageHeader
          title="Film Stocks"
          description="Every stock people here have shot, and what it looks like."
          action={<AddFilmButton />}
        />

        <BrowseFilters
          basePath="/films"
          active={{ process: processParam, balance: balanceParam }}
          groups={[
            // Process first: it is how people actually narrow film, and the
            // only field present on every stock.
            { key: 'process', label: 'Process', values: FILM_PROCESSES, counts: counts.process },
            { key: 'balance', label: 'Balance', values: COLOR_BALANCES, counts: counts.balance, showCounts: false },
          ]}
        />

        {filmStocks.length === 0 ? (
          <EmptyState
            icon={<FilmIcon />}
            message={
              process || colorBalance
                ? 'No film stocks match this filter'
                : 'No film stocks yet'
            }
            // Filtered to nothing is the one empty state a reader has to get
            // out of, and it offered nothing to press.
            action={process || colorBalance ? { href: '/films', label: 'Clear filters' } : undefined}
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filmStocks.map((film, cardIndex) => (
              <GearBrowseCard
                key={film.id}
                kind="film"
                gear={film}
                href={canonicalFilmPath(film)}
                previews={photosByFilm.get(film.id) ?? []}
                photoCount={film._count.photos}
                cardIndex={cardIndex}
                // h2. These cards are the page's content and sit directly under
                // its h1, with no section heading between, so h3 skipped a level.
                as="h2"
              />
            ))}
          </div>
        )}
      </main>

      <Footer />
    </div>
  )
}
