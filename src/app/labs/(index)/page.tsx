import { Prisma } from '@prisma/client'
import type { Metadata } from 'next'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import Header from '@/components/Header'
import PageShell from '@/components/PageShell'
import PageHeader from '@/components/ui/PageHeader'
import JsonLd from '@/components/JsonLd'
import BrowseFilters from '@/components/BrowseFilters'
import EmptyState from '@/components/ui/EmptyState'
import { GearBrowseCard } from '@/components/GearCard'
import { previewPhotosByGear, groupPreviews, VISIBLE_TO_ANYONE, notHidden } from '@/lib/previewPhotos'
import { PUBLIC_PHOTO } from '@/lib/photoVisibility'
import { photoCountsByLab, latestPhotoByGear } from '@/lib/counts'
import { CATALOG_SORTS, CATALOG_SORT_LABELS, sortCatalog, toCatalogSort } from '@/lib/catalogSort'
import { hiddenUserIds, hiddenFilter } from '@/lib/blocks'
import { applyFacets } from '@/lib/facets'
import { breadcrumbJsonLd } from '@/lib/seo/jsonld'
import { OG_DEFAULT_IMAGE } from '@/lib/seo/site'

const DESCRIPTION = 'Film labs that developed and scanned the rolls people here have published, and photos from each.'

export const metadata: Metadata = {
  title: 'Film labs',
  description: DESCRIPTION,
  openGraph: {
    title: 'Film labs – AvoidXray',
    description: DESCRIPTION,
    url: 'https://avoidxray.com/labs',
    images: [OG_DEFAULT_IMAGE],
  },
  alternates: { canonical: 'https://avoidxray.com/labs' },
}

export const dynamic = 'force-dynamic'

/**
 * Every lab in the catalog, as /cameras lists every camera: a card each with
 * a strip of published photos it developed, filtered by country and sorted
 * the same three ways.
 */
export default async function LabsPage({
  searchParams,
}: {
  searchParams: Promise<{ country?: string; sort?: string }>
}) {
  const { country: countryParam, sort: sortParam } = await searchParams
  const sort = toCatalogSort(sortParam)

  const session = await getServerSession(authOptions)
  const hidden = await hiddenUserIds((session?.user as { id?: string } | undefined)?.id)

  const allLabs = await prisma.lab.findMany({
    select: { id: true, slug: true, name: true, city: true, country: true },
  })
  // Checked against the countries present, so a hand-written value filters
  // nothing rather than everything.
  const country = allLabs.some(l => l.country === countryParam) ? countryParam : undefined
  const facets = applyFacets(allLabs, [{ key: 'country', active: country, valueOf: l => l.country }])
  const labs = facets.matches
  const ids = labs.map(l => l.id)
  const scope = { ...PUBLIC_PHOTO, ...hiddenFilter(hidden) }

  const [previews, photoCounts, latest] = await Promise.all([
    previewPhotosByGear({
      key: 'labId',
      parents: ids,
      where: Prisma.sql`${VISIBLE_TO_ANYONE} ${notHidden(hidden)}`,
      order: 'random',
    }),
    photoCountsByLab(ids, scope),
    sort === 'recent' ? latestPhotoByGear('labId', ids, scope) : undefined,
  ])
  const photosByLab = groupPreviews(previews, 'labId')
  const ordered = sortCatalog(labs, sort, photoCounts, latest)

  return (
    <PageShell header={<Header />}>
      <JsonLd
        data={breadcrumbJsonLd([
          { name: 'Home', path: '/' },
          { name: 'Labs', path: '/labs' },
        ])}
      />

      <main id="main-content" tabIndex={-1} className="flex-1 max-w-7xl mx-auto w-full py-10 md:py-16 px-6">
        <PageHeader
          title="Labs"
          description="Labs people here have had their film developed and scanned at, and photos from each."
        />

        <BrowseFilters
          basePath="/labs"
          active={{ country, sort: sortParam === sort ? sort : undefined }}
          shown={labs.length}
          total={allLabs.length}
          noun={{ one: 'lab', other: 'labs' }}
          sort={{ key: 'sort', values: CATALOG_SORTS, labels: CATALOG_SORT_LABELS, defaultValue: 'photos' }}
          groups={[
            { key: 'country', label: 'Country', values: facets.present.country, counts: facets.counts.country },
          ]}
        />

        {labs.length === 0 ? (
          <EmptyState
            message={country ? 'No labs match this filter' : 'No labs yet'}
            hint={country ? undefined : 'Labs are added when someone names the lab that developed a roll.'}
            action={country ? { href: sort === 'photos' ? '/labs' : `/labs?sort=${sort}`, label: 'Clear filters' } : undefined}
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {ordered.map((lab, cardIndex) => (
              <GearBrowseCard
                key={lab.id}
                kind="lab"
                gear={lab}
                href={`/labs/${lab.slug}`}
                previews={photosByLab.get(lab.id) ?? []}
                photoCount={photoCounts.get(lab.id) ?? 0}
                cardIndex={cardIndex}
                extraFact={[lab.city, lab.country].filter(Boolean).join(', ') || undefined}
                as="h2"
              />
            ))}
          </div>
        )}
      </main>
    </PageShell>
  )
}
