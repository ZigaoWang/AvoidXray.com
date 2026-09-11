import { prisma } from '@/lib/db'
import { Prisma } from '@prisma/client'
import { previewPhotosByGear, groupPreviews, VISIBLE_TO_ANYONE, notHidden } from '@/lib/previewPhotos'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import PageHeader from '@/components/ui/PageHeader'
import AddCameraButton from '@/components/AddCameraButton'
import type { Metadata } from 'next'
import JsonLd from '@/components/JsonLd'
import { GearBrowseCard } from '@/components/GearCard'
import { canonicalCameraPath } from '@/lib/seo/resolve'
import { breadcrumbJsonLd } from '@/lib/seo/jsonld'
import { PUBLIC_PHOTO } from '@/lib/photoVisibility'
import { photoCountsByCamera } from '@/lib/counts'
import { CATALOG_SORTS, CATALOG_SORT_LABELS, sortCatalog, toCatalogSort } from '@/lib/catalogSort'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { hiddenUserIds, hiddenFilter } from '@/lib/blocks'
import BrowseFilters from '@/components/BrowseFilters'
import EmptyState, { CameraIcon } from '@/components/ui/EmptyState'
import { FORMATS } from '@/lib/constants'
import { toBodyType, BODY_TYPES, BODY_TYPE_LABELS } from '@/lib/cameraFields'
import { OG_DEFAULT_IMAGE } from '@/lib/seo/site'

export const metadata: Metadata = {
  title: 'Cameras',
  description: 'Photos organized by camera, uploaded by the AvoidXray community.',
  openGraph: {
    title: 'Cameras – AvoidXray',
    description: 'Photos organized by camera, uploaded by the AvoidXray community.',
    url: 'https://avoidxray.com/cameras',
      images: [OG_DEFAULT_IMAGE],
    },
  alternates: {
    canonical: 'https://avoidxray.com/cameras',
  },
}

export const dynamic = 'force-dynamic'

/** Only values the catalog actually uses, so a filter cannot match nothing. */
function tally(rows: { _count: { _all: number } }[], keys: (string | null)[]) {
  return Object.fromEntries(
    rows
      .map((row, i) => [keys[i], row._count._all] as const)
      .filter(([key]) => key !== null)
  ) as Record<string, number>
}

export default async function CamerasPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; format?: string; brand?: string; sort?: string }>
}) {
  const { type: typeParam, format: formatParam, brand: brandParam, sort: sortParam } =
    await searchParams
  // Checked against the known lists, so a hand-written query parameter cannot
  // filter on an arbitrary string.
  const bodyType = toBodyType(typeParam ?? null)
  const format = FORMATS.find(f => f === formatParam)
  // The stored string, matched exactly: the chips are built from the values
  // the column actually holds.
  const brand = brandParam?.trim() || undefined
  const sort = toCatalogSort(sortParam)

  // The block rule, which the camera and film detail pages already apply and
  // this index did not: a blocked account's photograph still turned up in the
  // preview strip on a card, and in the count printed under it.
  const session = await getServerSession(authOptions)
  const hidden = await hiddenUserIds((session?.user as { id?: string } | undefined)?.id)

  // Counts come from the unfiltered set, so a chip still reports how many it
  // would match while another filter is applied — the same rule the film
  // index follows.
  const [cameras, typeCounts, formatCounts, brandCounts] = await Promise.all([
    prisma.camera.findMany({
      where: {
        ...(bodyType ? { bodyType } : {}),
        ...(format ? { format } : {}),
        ...(brand ? { brand } : {}),
      },
      // Selected, not included, for the reason on the film index: `include`
      // fetches every column, and this card draws a name and a photo count.
      select: {
        id: true,
        slug: true,
        name: true,
        brand: true,
        imageUrl: true,
        imageStatus: true,
      },
      // The reading order; the chips can ask for the other one. The photo
      // counts come from photoCountsByCamera below rather than a `_count`
      // here, which Prisma compiles into an unrestricted aggregate over the
      // whole Photo table — see lib/counts.
      orderBy: { name: 'asc' }
    }),
    prisma.camera.groupBy({ by: ['bodyType'], _count: { _all: true } }),
    prisma.camera.groupBy({ by: ['format'], _count: { _all: true } }),
    // How people actually think about bodies — Canon, Nikon, Olympus — and
    // the axis both indexes were missing.
    prisma.camera.groupBy({ by: ['brand'], _count: { _all: true }, orderBy: { _count: { brand: 'desc' } } }),
  ])

  const brandValues = brandCounts
    .map(row => row.brand)
    .filter((value): value is string => Boolean(value && value.trim()))

  const counts = {
    type: tally(typeCounts, typeCounts.map(r => r.bodyType)),
    format: tally(formatCounts, formatCounts.map(r => r.format)),
    brand: tally(brandCounts, brandCounts.map(r => r.brand)),
  }

  // Four photos for each body, shuffled so the strip is an invitation to
  // browse rather than a record of the most recent upload — and the counts the
  // cards print, which are also what the default ordering is by.
  const [previews, photoCounts] = await Promise.all([
    previewPhotosByGear({
      key: 'cameraId',
      parents: cameras.map((c) => c.id),
      where: Prisma.sql`${VISIBLE_TO_ANYONE} ${notHidden(hidden)}`,
      order: 'random',
    }),
    photoCountsByCamera(cameras.map((c) => c.id), { ...PUBLIC_PHOTO, ...hiddenFilter(hidden) }),
  ])
  const photosByCamera = groupPreviews(previews, 'cameraId')
  const ordered = sortCatalog(cameras, sort, photoCounts)

  return (
    <div className="min-h-dvh bg-[#0a0a0a] flex flex-col">
      <JsonLd
        data={breadcrumbJsonLd([
          { name: 'Home', path: '/' },
          { name: 'Cameras', path: '/cameras' },
        ])}
      />
      <Header />

      <main id="main-content" tabIndex={-1} className="flex-1 max-w-7xl mx-auto w-full py-10 md:py-16 px-6">
        <PageHeader
          title="Cameras"
          description="Every body people here have shot, and what it looks like."
          action={<AddCameraButton />}
        />

        <BrowseFilters
          basePath="/cameras"
          active={{ type: typeParam, format: formatParam, brand: brandParam, sort: sortParam }}
          groups={[
            {
              key: 'sort',
              label: 'Sort',
              values: CATALOG_SORTS,
              labels: CATALOG_SORT_LABELS,
              defaultValue: 'photos',
            },
            { key: 'type', label: 'Type', values: BODY_TYPES, counts: counts.type, labels: BODY_TYPE_LABELS },
            { key: 'format', label: 'Format', values: FORMATS, counts: counts.format, showCounts: false },
            { key: 'brand', label: 'Brand', values: brandValues, counts: counts.brand, showCounts: false },
          ]}
        />

        {cameras.length === 0 ? (
          <EmptyState
            icon={<CameraIcon />}
            message={bodyType || format || brand ? 'No cameras match this filter' : 'No cameras yet'}
            action={bodyType || format || brand ? { href: '/cameras', label: 'Clear filters' } : undefined}
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {ordered.map((camera, cardIndex) => (
              <GearBrowseCard
                key={camera.id}
                kind="camera"
                gear={camera}
                href={canonicalCameraPath(camera)}
                previews={photosByCamera.get(camera.id) ?? []}
                photoCount={photoCounts.get(camera.id) ?? 0}
                cardIndex={cardIndex}
                // h2, for the reason the film index says.
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
