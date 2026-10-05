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
import { applyFacets } from '@/lib/facets'
import EmptyState, { CameraIcon } from '@/components/ui/EmptyState'
import { FORMATS } from '@/lib/constants'
import { toBodyType, BODY_TYPES, BODY_TYPE_LABELS } from '@/lib/cameraFields'
import { OG_DEFAULT_IMAGE } from '@/lib/seo/site'

export const metadata: Metadata = {
  title: 'Film Camera Sample Photos',
  description: 'Sample photos from SLRs, rangefinders, point-and-shoots, disposables and other film cameras, uploaded by the photographers who shot them.',
  openGraph: {
    title: 'Film Camera Sample Photos – AvoidXray',
    description: 'Sample photos from SLRs, rangefinders, point-and-shoots, disposables and other film cameras, uploaded by the photographers who shot them.',
    url: 'https://avoidxray.com/cameras',
      images: [OG_DEFAULT_IMAGE],
    },
  alternates: {
    canonical: 'https://avoidxray.com/cameras',
  },
}

export const dynamic = 'force-dynamic'

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
  // A Brand slug, through the relation — the same source the film index uses,
  // and the one brand search already joins on. The free-text column agrees on
  // every camera in the catalog today, but only the relation is guaranteed to.
  const brand = brandParam?.trim() || undefined
  const sort = toCatalogSort(sortParam)

  // The block rule, which the camera and film detail pages already apply and
  // this index did not: a blocked account's photograph still turned up in the
  // preview strip on a card, and in the count printed under it.
  const session = await getServerSession(authOptions)
  const hidden = await hiddenUserIds((session?.user as { id?: string } | undefined)?.id)

  // The whole catalog, once, for the reason the film index gives: each chip's
  // count is taken with the other filters applied, which needs the records
  // the current filter excludes as well.
  const [allCameras, brands] = await Promise.all([
    prisma.camera.findMany({
      // Selected, not included, for the reason on the film index: `include`
      // fetches every column, and this card draws a name and a photo count.
      select: {
        id: true,
        slug: true,
        name: true,
        brand: true,
        imageUrl: true,
        imageStatus: true,
        bodyType: true,
        format: true,
        brandId: true,
      },
      // Photo counts come from photoCountsByCamera below rather than a
      // `_count` here, which Prisma compiles into an unrestricted aggregate
      // over the whole Photo table. See lib/counts.
      orderBy: { name: 'asc' }
    }),
    // Small table, whole table: this resolves brand ids into the names and
    // slugs the chips are written with.
    prisma.brand.findMany({ select: { id: true, name: true, slug: true } }),
  ])

  const brandById = new Map(brands.map(b => [b.id, b]))
  const facets = applyFacets(allCameras, [
    { key: 'type', active: bodyType ?? undefined, valueOf: c => c.bodyType },
    { key: 'format', active: format, valueOf: c => c.format },
    { key: 'brand', active: brand, valueOf: c => (c.brandId ? brandById.get(c.brandId)?.slug : null) },
  ])
  const cameras = facets.matches
  const brandLabels = Object.fromEntries(brands.map(b => [b.slug, b.name]))

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
          shown={cameras.length}
          total={allCameras.length}
          noun={{ one: 'camera', other: 'cameras' }}
          sort={{ key: 'sort', values: CATALOG_SORTS, labels: CATALOG_SORT_LABELS, defaultValue: 'photos' }}
          groups={[
            {
              key: 'type',
              label: 'Type',
              values: BODY_TYPES.filter(v => facets.present.type.includes(v)),
              counts: facets.counts.type,
              labels: BODY_TYPE_LABELS,
            },
            {
              key: 'format',
              label: 'Format',
              values: FORMATS.filter(v => facets.present.format.includes(v)),
              counts: facets.counts.format,
            },
            { key: 'brand', label: 'Brand', values: facets.present.brand, counts: facets.counts.brand, labels: brandLabels },
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
