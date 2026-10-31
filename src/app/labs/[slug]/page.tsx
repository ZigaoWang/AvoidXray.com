import { cache } from 'react'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import Header from '@/components/Header'
import PageShell from '@/components/PageShell'
import MasonryGrid from '@/components/MasonryGrid'
import SamplePhotosHeader from '@/components/SamplePhotosHeader'
import JsonLd from '@/components/JsonLd'
import GearIdentity from '@/components/GearIdentity'
import GearLinks from '@/components/GearLinks'
import DetailSpecs from '@/components/DetailSpecs'
import CollapsibleProse from '@/components/CollapsibleProse'
import SpecChip from '@/components/SpecChip'
import SuggestEditButton from '@/components/SuggestEditButton'
import Breadcrumb from '@/components/ui/Breadcrumb'
import { textLinkClass } from '@/components/ui/TextLink'
import { PUBLIC_PHOTO } from '@/lib/photoVisibility'
import { hiddenFilter, hiddenUserIds } from '@/lib/blocks'
import { photoCountsByCamera, photoCountsByFilmStock } from '@/lib/counts'
import { feedScopeQuery } from '@/lib/photoFeed'
import { scopedFirstPage, toSampleOrder } from '@/lib/feedFirstPage'
import { randomSeed } from '@/lib/seededShuffle'
import { descriptionParagraphs, summaryFromDescription } from '@/lib/catalogForm'
import { breadcrumbJsonLd, collectionJsonLd } from '@/lib/seo/jsonld'
import { photographersPhrase } from '@/lib/seo/hubCopy'
import { canonicalCameraPath, canonicalFilmPath } from '@/lib/seo/slug'
import { displayName } from '@/lib/seo/alt'
import { safeHttpUrl } from '@/lib/validation'
import { usefulAliases } from '@/lib/aliases'
import { SITE_URL } from '@/lib/seo/site'
import { labPlace } from '@/lib/labFields'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ slug: string }> }

const loadLab = cache((slug: string) => prisma.lab.findUnique({ where: { slug } }))

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params
  const lab = await loadLab(slug)
  // As on the camera page: notFound() in both, the status from src/proxy.ts.
  if (!lab) notFound()

  const byPhotographer = await prisma.photo.groupBy({
    by: ['userId'],
    where: { ...PUBLIC_PHOTO, labId: lab.id },
    _count: { _all: true },
  })
  const photoCount = byPhotographer.reduce((sum, row) => sum + row._count._all, 0)
  const place = labPlace(lab)
  const title = `${lab.name}${place ? `, ${place}` : ''}: film lab`
  const description = [
    photoCount > 0
      ? `${photoCount === 1 ? 'One scan' : `${photoCount} scans`} developed by ${lab.name}, from ${photographersPhrase(byPhotographer.length)}.`
      : null,
    summaryFromDescription(lab.description),
  ].filter(Boolean).join(' ') || `${lab.name} is a film lab${place ? ` in ${place}` : ''}.`
  const canonical = `${SITE_URL}/labs/${lab.slug}`

  return {
    title,
    description,
    // Linked from the index, but nothing to show a searcher yet.
    ...(photoCount === 0 && { robots: { index: false, follow: true } }),
    openGraph: { title, description, type: 'website', url: canonical },
    twitter: { card: 'summary_large_image', title, description },
    alternates: { canonical },
  }
}

/**
 * A lab, as a camera or a film stock has its page: what it is, the film and
 * cameras its rolls were shot on, and the published photos it developed.
 */
export default async function LabPage({
  params,
  searchParams,
}: Params & { searchParams: Promise<{ order?: string }> }) {
  const { slug } = await params
  const order = toSampleOrder((await searchParams).order)
  const session = await getServerSession(authOptions)
  const userId = (session?.user as { id?: string } | undefined)?.id

  const lab = await loadLab(slug)
  if (!lab) notFound()

  const hiddenIds = await hiddenUserIds(userId)
  const scope = { ...PUBLIC_PHOTO, ...hiddenFilter(hiddenIds), labId: lab.id }
  const seed = randomSeed()

  const [firstPage, byPhotographer, films, cameras] = await Promise.all([
    scopedFirstPage({ scope: { labId: lab.id }, order, seed, hidden: hiddenIds, viewerId: userId }),
    prisma.photo.groupBy({ by: ['userId'], where: scope, _count: { _all: true } }),
    prisma.filmStock.findMany({
      where: { photos: { some: scope } },
      select: { id: true, name: true, brand: true, manufacturer: true, slug: true },
    }),
    prisma.camera.findMany({
      where: { photos: { some: scope } },
      select: { id: true, name: true, brand: true, slug: true },
    }),
  ])
  const [filmCounts, cameraCounts] = await Promise.all([
    photoCountsByFilmStock(films.map(f => f.id), scope),
    photoCountsByCamera(cameras.map(c => c.id), scope),
  ])
  const totalPhotos = byPhotographer.reduce((sum, row) => sum + row._count._all, 0)

  const byCount = (a: { count: number; label: string }, b: { count: number; label: string }) =>
    b.count - a.count || a.label.localeCompare(b.label)
  const filmLinks = films
    .map(f => ({ href: canonicalFilmPath(f), label: displayName(f) ?? f.name, count: filmCounts.get(f.id) ?? 0 }))
    .sort(byCount)
  const cameraLinks = cameras
    .map(c => ({ href: canonicalCameraPath(c), label: displayName(c) ?? c.name, count: cameraCounts.get(c.id) ?? 0 }))
    .sort(byCount)

  const place = labPlace(lab)
  const website = safeHttpUrl(lab.website)
  const leadSentence = summaryFromDescription(lab.description)
  const alternateNames = usefulAliases(lab.name, lab.aliases)
  const path = `/labs/${lab.slug}`

  const specRows: Array<{ label: string; value: React.ReactNode }> = [
    ...(website
      ? [{
          label: 'Website',
          value: (
            <a href={website} target="_blank" rel="nofollow noopener noreferrer" className={textLinkClass}>
              {website.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')}
            </a>
          ),
        }]
      : []),
    ...(alternateNames.length > 0 ? [{ label: 'Also known as', value: alternateNames.join(', ') }] : []),
  ]

  return (
    <PageShell header={<Header />}>
      <JsonLd
        data={[
          breadcrumbJsonLd([
            { name: 'Home', path: '/' },
            { name: 'Labs', path: '/labs' },
            { name: lab.name, path },
          ]),
          collectionJsonLd({
            name: `Photos developed by ${lab.name}`,
            description: `${totalPhotos} film photographs developed by ${lab.name}.`,
            path,
            photos: firstPage.photos,
            totalPhotos,
          }),
        ]}
      />

      <main id="main-content" tabIndex={-1} className="flex-1 max-w-7xl mx-auto w-full py-8 md:py-16 px-6">
        <Breadcrumb trail={[{ href: '/', label: 'Home' }, { href: '/labs', label: 'Labs' }]} current={lab.name} />

        {/* The camera page's panel, less the product shot a lab has none of. */}
        <div className="bg-gradient-to-br from-neutral-900 to-neutral-950 border border-neutral-800 mb-8 p-6 md:p-8">
          <GearIdentity as="h1" variant="hero" gear={lab} />

          <div className="flex flex-wrap items-center gap-2 mb-4">
            {place && <SpecChip>{place}</SpecChip>}
            <span className="text-xs text-neutral-500">{totalPhotos} {totalPhotos === 1 ? 'photo' : 'photos'}</span>
          </div>

          {leadSentence && <p className="mb-3 text-base leading-relaxed text-neutral-200">{leadSentence}</p>}
          {lab.description && <CollapsibleProse paragraphs={descriptionParagraphs(lab.description, leadSentence)} />}

          <DetailSpecs specs={specRows} />

          {/* Through the same dialog and review as a camera or a film. */}
          <div className="mt-6 md:max-w-xs">
            <SuggestEditButton type="lab" record={lab} currentImage={null} />
          </div>
        </div>

        <GearLinks heading="Film stocks developed" items={filmLinks} />
        <GearLinks heading="Cameras" items={cameraLinks} />

        <div>
          <SamplePhotosHeader
            title={`Photos developed by ${lab.name}`}
            summary={totalPhotos > 0 && (
              <>
                {totalPhotos} {totalPhotos === 1 ? 'photo' : 'photos'} from {photographersPhrase(byPhotographer.length)}
              </>
            )}
            order={order}
            basePath={path}
            total={totalPhotos}
          />

          <MasonryGrid
            initialPhotos={firstPage.photos}
            initialOffset={firstPage.nextOffset}
            tab={order}
            seed={order === 'random' ? seed : undefined}
            scopeQuery={feedScopeQuery({ labId: lab.id })}
            emptyMessage={`No published photos developed by ${lab.name} yet`}
          />
        </div>
      </main>
    </PageShell>
  )
}
