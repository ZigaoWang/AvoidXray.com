import { prisma } from '@/lib/db'
import { Prisma } from '@prisma/client'
import { previewPhotosByGear, groupPreviews, VISIBLE_TO_ANYONE, notHidden } from '@/lib/previewPhotos'
import Link from 'next/link'
import Image from 'next/image'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import AddCameraButton from '@/components/AddCameraButton'
import type { Metadata } from 'next'
import { blurPlaceholder, BLUR_SIZE, CARD_PREVIEW_BLUR_COUNT } from '@/lib/blurhash'
import JsonLd from '@/components/JsonLd'
import { displayName, gearImageAlt } from '@/lib/seo/alt'
import { canonicalCameraPath } from '@/lib/seo/resolve'
import { breadcrumbJsonLd } from '@/lib/seo/jsonld'
import { PUBLIC_PHOTO } from '@/lib/photoVisibility'
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
  searchParams: Promise<{ type?: string; format?: string }>
}) {
  const { type: typeParam, format: formatParam } = await searchParams
  // Checked against the known lists, so a hand-written query parameter cannot
  // filter on an arbitrary string.
  const bodyType = toBodyType(typeParam ?? null)
  const format = FORMATS.find(f => f === formatParam)

  // The block rule, which the camera and film detail pages already apply and
  // this index did not: a blocked account's photograph still turned up in the
  // preview strip on a card, and in the count printed under it.
  const session = await getServerSession(authOptions)
  const hidden = await hiddenUserIds((session?.user as { id?: string } | undefined)?.id)

  // Counts come from the unfiltered set, so a chip still reports how many it
  // would match while another filter is applied — the same rule the film
  // index follows.
  const [cameras, typeCounts, formatCounts] = await Promise.all([
    prisma.camera.findMany({
      where: {
        ...(bodyType ? { bodyType } : {}),
        ...(format ? { format } : {}),
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
        _count: { select: { photos: { where: { ...PUBLIC_PHOTO, ...hiddenFilter(hidden) } } } },
      },
      orderBy: { name: 'asc' }
    }),
    prisma.camera.groupBy({ by: ['bodyType'], _count: { _all: true } }),
    prisma.camera.groupBy({ by: ['format'], _count: { _all: true } }),
  ])

  const counts = {
    type: tally(typeCounts, typeCounts.map(r => r.bodyType)),
    format: tally(formatCounts, formatCounts.map(r => r.format)),
  }

  // Four photos for each body, shuffled so the strip is an invitation to
  // browse rather than a record of the most recent upload.
  const photosByCamera = groupPreviews(
    await previewPhotosByGear({
      key: 'cameraId',
      parents: cameras.map((c) => c.id),
      where: Prisma.sql`${VISIBLE_TO_ANYONE} ${notHidden(hidden)}`,
      order: 'random',
    }),
    'cameraId'
  )

  return (
    <div className="min-h-dvh bg-[#0a0a0a] flex flex-col">
      <JsonLd
        data={breadcrumbJsonLd([
          { name: 'Home', path: '/' },
          { name: 'Cameras', path: '/cameras' },
        ])}
      />
      <Header />

      <main id="main-content" tabIndex={-1} className="flex-1 max-w-7xl mx-auto w-full py-16 px-6">
        <div className="flex items-center justify-between mb-12">
          <div>
            <h1 className="text-4xl font-black text-white mb-2 tracking-tight">Cameras</h1>
            <p className="text-neutral-500">Explore photos by camera</p>
          </div>
          <AddCameraButton />
        </div>

        <BrowseFilters
          basePath="/cameras"
          active={{ type: typeParam, format: formatParam }}
          groups={[
            { key: 'type', label: 'Type', values: BODY_TYPES, counts: counts.type, labels: BODY_TYPE_LABELS },
            { key: 'format', label: 'Format', values: FORMATS, counts: counts.format, showCounts: false },
          ]}
        />

        {cameras.length === 0 ? (
          <EmptyState
            icon={<CameraIcon />}
            message={bodyType || format ? 'No cameras match this filter' : 'No cameras yet'}
            action={bodyType || format ? { href: '/cameras', label: 'Clear filters' } : undefined}
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {cameras.map((camera, cardIndex) => {
              const displayImage = camera.imageStatus === 'approved' ? camera.imageUrl : null
              const photos = photosByCamera.get(camera.id) || []
              return (
                <Link
                  key={camera.id}
                  href={canonicalCameraPath(camera)}
                  className="group bg-neutral-900 border border-neutral-800 hover:border-brand transition-colors overflow-hidden"
                >
                  {/* Photo Grid */}
                  <div className="grid grid-cols-4 gap-px bg-neutral-800">
                    {photos.slice(0, 4).map((photo, previewIndex) => (
                      <div key={photo.id} className="aspect-square relative bg-neutral-900">
                        <Image
                          src={photo.thumbnailPath}
                          alt={`Sample photo shot on a ${displayName(camera) ?? camera.name}`}
                          fill
                          className="object-cover"
                          sizes="100px"
                          {...blurPlaceholder(
                            photo.blurHash,
                            cardIndex * 4 + previewIndex,
                            CARD_PREVIEW_BLUR_COUNT,
                            BLUR_SIZE.tile
                          )}
                        />
                      </div>
                    ))}
                    {Array.from({ length: Math.max(0, 4 - photos.length) }).map((_, i) => (
                      <div key={i} className="aspect-square bg-neutral-900" />
                    ))}
                  </div>

                  {/* Info Section with Camera Image */}
                  <div className="p-4 flex items-center gap-4">
                    {/* Always reserve space for image */}
                    <div className="relative w-32 h-24 flex-shrink-0">
                      {displayImage ? (
                        <Image
                          src={displayImage}
                          alt={gearImageAlt(camera, 'camera')}
                          fill
                          className="object-contain"
                        sizes="128px" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-neutral-800">
                          <svg
                            className="w-12 h-12 text-neutral-600"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
                            />
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"
                            />
                          </svg>
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        {/* h2, for the reason the film index says. */}
                        <h2 className="text-lg font-bold group-hover:text-brand transition-colors truncate">
                          {displayName(camera) ?? camera.name}
                        </h2>
                      </div>
                      <p className="text-neutral-500">{camera._count.photos} photos</p>
                    </div>
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </main>

      <Footer />
    </div>
  )
}
