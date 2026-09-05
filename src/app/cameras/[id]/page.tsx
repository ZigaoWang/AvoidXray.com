import { prisma } from '@/lib/db'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import SuggestEditButton from '@/components/SuggestEditButton'
import MasonryGrid from '@/components/MasonryGrid'
import CommunityNotes from '@/components/CommunityNotes'
import JsonLd from '@/components/JsonLd'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import type { Metadata } from 'next'
import { resolveCameraSlug, lookupCamera, canonicalFilmPath } from '@/lib/seo/resolve'
import { breadcrumbJsonLd, collectionJsonLd, gearJsonLd } from '@/lib/seo/jsonld'
import { displayName, gearImageAlt, article } from '@/lib/seo/alt'
import { usefulAliases } from '@/lib/aliases'
import CompletenessNote from '@/components/CompletenessNote'
import { completenessOf, NOT_YET_STARTED } from '@/lib/completeness'
import { ADMIN_RESOURCES } from '@/lib/admin/resources'
import { SITE_URL, comboUrl } from '@/lib/seo/site'
import { FEED_FIRST_PAGE, feedOrderBy } from '@/lib/photoFeed'
import { PUBLIC_PHOTO } from '@/lib/photoVisibility'
import { hiddenPhotoFilter } from '@/lib/blocks'
import { bodyTypeLabel, bodyTypeProse } from '@/lib/cameraFields'
import type { CameraBodyType } from '@prisma/client'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

function specString(camera: { bodyType: CameraBodyType | null; format: string | null; year: number | null }) {
  const specs = [bodyTypeLabel(camera.bodyType), camera.format, camera.year ? String(camera.year) : null].filter(Boolean)
  return specs.length ? ` (${specs.join(', ')})` : ''
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params
  const camera = await lookupCamera(id)
  if (!camera) return { title: 'Camera Not Found' }

  const name = displayName(camera) ?? camera.name
  const photoCount = await prisma.photo.count({ where: { ...PUBLIC_PHOTO, cameraId: camera.id } })

  const title = `${name}${specString(camera)}`

  // The summary exists for this: a link preview wants the sentence that says
  // what the camera is, not a description cut off mid-clause.
  const description = camera.summary
    ? `${camera.summary} ${photoCount} sample ${photoCount === 1 ? 'photograph' : 'photographs'} from the AvoidXray community.`
    : `${name} sample photos: ${photoCount} real film ${photoCount === 1 ? 'photograph' : 'photographs'} ` +
      `shot on ${article(name)} ${name} by the AvoidXray community. See what this ${
        bodyTypeLabel(camera.bodyType)?.toLowerCase() ?? 'film camera'
      } actually produces before you buy one.`

  const canonical = `${SITE_URL}/cameras/${camera.slug ?? camera.id}`

  // See the note in films/[id]/page.tsx: the raw product shot is the wrong
  // shape for a link preview, and setting `images` here would suppress the
  // 1200x630 card rendered by opengraph-image.tsx.
  return {
    title,
    description,
    keywords: [
      `${name} sample photos`,
      `${name} sample images`,
      `shot on ${name}`,
      `${name} review`,
      `${name} film camera`,
      name,
    ],
    openGraph: {
      title: `${name} – Sample Photos`,
      description,
      type: 'website',
      url: canonical,
    },
    twitter: { card: 'summary_large_image', title: name, description },
    alternates: { canonical },
  }
}

export default async function CameraDetailPage({ params }: Params) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  const userId = (session?.user as { id?: string } | undefined)?.id

  const camera = await resolveCameraSlug(id)
  if (!camera) notFound()

  // Blocked in either direction, matching what /api/photos applies to every
  // page after the first.
  const hidden = await hiddenPhotoFilter(userId)

  // Only the first screen; MasonryGrid pages the rest through /api/photos.
  const photos = await prisma.photo.findMany({
    where: { ...PUBLIC_PHOTO, ...hidden, cameraId: camera.id },
    // Matches the ordering /api/photos pages by; see the film page.
    orderBy: feedOrderBy('recent'),
    take: FEED_FIRST_PAGE + 1,
    select: {
      id: true,
      thumbnailPath: true,
      mediumPath: true,
      width: true,
      height: true,
      blurHash: true,
      caption: true,
      takenDate: true,
      filmStock: { select: { name: true, brand: true } },
      user: { select: { name: true, username: true } },
      _count: { select: { likes: true } },
    },
  })

  const totalPhotos = await prisma.photo.count({
    where: { ...PUBLIC_PHOTO, ...hidden, cameraId: camera.id },
  })

  const userLikes = userId
    ? await prisma.like.findMany({
        where: { userId, photoId: { in: photos.map((p) => p.id) } },
        select: { photoId: true },
      })
    : []
  const likedIds = new Set(userLikes.map((l) => l.photoId))

  const hasMore = photos.length > FEED_FIRST_PAGE
  const initialPhotos = (hasMore ? photos.slice(0, FEED_FIRST_PAGE) : photos).map((p) => ({
    ...p,
    camera: { name: camera.name, brand: camera.brand },
    liked: likedIds.has(p.id),
  }))

  // Films actually shot on this body — the reverse side of the combo pages.
  const pairedFilms = await prisma.filmStock.findMany({
    where: { photos: { some: { ...PUBLIC_PHOTO, cameraId: camera.id } } },
    select: {
      id: true,
      name: true,
      brand: true,
      slug: true,
      _count: { select: { photos: { where: { ...PUBLIC_PHOTO, cameraId: camera.id } } } },
    },
    orderBy: { name: 'asc' },
  })

  const name = displayName(camera) ?? camera.name
  // Aliases that add something the name does not already say.
  const alternateNames = usefulAliases(name, camera.aliases)

  // Which fields carry a source, for the completeness note at the foot.
  const provenance = await prisma.fieldProvenance.findMany({
    where: { entityType: 'CAMERA', entityId: camera.id },
    select: { fieldName: true, sourceUrl: true, claims: true },
  })
  const citedFields = new Set(provenance.filter(p => p.sourceUrl).map(p => p.fieldName))
  const allClaims = provenance.flatMap(
    p => (p.claims ?? []) as Array<{ url?: string | null; editorial?: boolean | null }>
  )
  const completeness = completenessOf('CAMERA', camera as unknown as Record<string, unknown>, citedFields, allClaims, NOT_YET_STARTED)
  const displayImage = camera.imageStatus === 'approved' ? camera.imageUrl : null
  const displayDescription = camera.imageStatus === 'approved' ? camera.description : null
  const canonicalPath = `/cameras/${camera.slug ?? camera.id}`

  const specs = [
    camera.bodyType && { label: 'Type', value: bodyTypeLabel(camera.bodyType)! },
    camera.format && { label: 'Format', value: camera.format },
    camera.mountType && { label: 'Mount', value: camera.mountType },
    camera.year && { label: 'Year', value: String(camera.year) },
  ].filter(Boolean) as Array<{ label: string; value: string }>

  return (
    <div className="min-h-dvh bg-[#0a0a0a] flex flex-col">
      <JsonLd
        data={[
          breadcrumbJsonLd([
            { name: 'Home', path: '/' },
            { name: 'Cameras', path: '/cameras' },
            { name, path: canonicalPath },
          ]),
          collectionJsonLd({
            name: `Photos shot on ${article(name)} ${name}`,
            description: `${totalPhotos} film photographs shot on ${article(name)} ${name}.`,
            path: canonicalPath,
            photos: initialPhotos,
            totalPhotos,
            // The camera is the subject of the page, not a standalone entity.
            about: gearJsonLd({
              name,
              description:
                displayDescription ||
                `${name} film camera. ${totalPhotos} sample photographs shot by the AvoidXray community.`,
              path: canonicalPath,
              imageUrl: displayImage,
              brand: camera.brand,
              photoCount: totalPhotos,
              category: 'Film camera',
              properties: specs.map((s) => ({ name: s.label, value: s.value })),
            }),
          }),
        ]}
      />
      <Header />

      <main className="flex-1 max-w-7xl mx-auto w-full py-8 md:py-16 px-4 md:px-6">
        <nav aria-label="Breadcrumb" className="text-sm mb-6">
          <ol className="flex items-center gap-2 text-neutral-500">
            <li><Link href="/" className="hover:text-white">Home</Link></li>
            <li aria-hidden>/</li>
            <li><Link href="/cameras" className="hover:text-white">Cameras</Link></li>
            <li aria-hidden>/</li>
            <li aria-current="page" className="text-neutral-300">{name}</li>
          </ol>
        </nav>

        <div className="bg-gradient-to-br from-neutral-900 to-neutral-950 border border-neutral-800 overflow-hidden mb-8">
          <div className="flex flex-col md:flex-row">
            <div className="w-full md:w-2/5 lg:w-1/3 bg-neutral-900/50 flex items-center justify-center min-h-[200px] p-6 md:p-0">
              {displayImage ? (
                <div className="relative w-full h-full min-h-[200px]">
                  <Image
                    src={displayImage}
                    alt={gearImageAlt(camera, 'camera')}
                    fill
                    className="object-contain"
                    priority
                  />
                </div>
              ) : (
                <div className="w-full aspect-[4/3] flex items-center justify-center">
                  <svg className="w-24 h-24 text-neutral-700" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </div>
              )}
            </div>

            <div className="flex-1 p-6 md:p-8 flex flex-col justify-between">
              <div>
                {camera.brand && (
                  <div className="text-[#D32F2F] text-xs font-medium uppercase tracking-widest mb-1">{camera.brand}</div>
                )}
                <h1 className="text-2xl md:text-3xl font-bold text-white mb-3 tracking-tight leading-tight">
                  {camera.name}
                </h1>

                <div className="flex flex-wrap items-center gap-2 mb-4">
                  {specs.map((s) => (
                    <span key={s.label} className="text-xs px-2 py-0.5 border border-neutral-700 text-neutral-300">
                      {s.value}
                    </span>
                  ))}
                  <span className="text-xs text-neutral-500">{totalPhotos} photos</span>
                </div>

                {/* The summary leads and the description follows it. They do
                    different jobs: this one answers "what is this" for someone
                    who has never heard of it, which is also why it is what the
                    metadata and link previews use instead of a truncated
                    description. */}
                {camera.summary && (
                  <p className="mb-3 text-base leading-relaxed text-neutral-200">{camera.summary}</p>
                )}

                <div className="space-y-3 text-sm leading-relaxed text-neutral-400">
                  {(displayDescription ||
                    `${name} is ${bodyTypeProse(camera.bodyType)}${
                      camera.format ? ` shooting ${camera.format}` : ''
                    }${camera.year ? `, introduced in ${camera.year}` : ''}.`)
                    .split('\n\n')
                    .map((para, i) => (
                      <p key={i}>{para}</p>
                    ))}
                </div>
              </div>

              {alternateNames.length > 0 && (
                <p className="mt-3 text-sm text-neutral-500">
                  Also known as{' '}
                  <span className="text-neutral-300">{alternateNames.join(', ')}</span>
                </p>
              )}

              <div className="mt-6">
                <SuggestEditButton
                  type="camera"
                  id={camera.id}
                  name={camera.name}
                  brand={camera.brand}
                  currentImage={displayImage}
                  currentDescription={displayDescription}
                  cameraType={camera.bodyType}
                  format={camera.format}
                  year={camera.year}
                  defaultFilmStockId={camera.defaultFilmStockId}
                  aliases={camera.aliases}
                  noDescription={!displayDescription}
                />
              </div>
            </div>
          </div>
        </div>

        {pairedFilms.length > 0 && (
          <section className="mb-10">
            <h2 className="text-lg font-bold text-white mb-4">Films used</h2>
            <div className="flex flex-wrap gap-2">
              {pairedFilms.map((film) => {
                const filmName = displayName(film) ?? film.name
                const href =
                  film.slug && camera.slug ? comboUrl(film.slug, camera.slug) : canonicalFilmPath(film)
                return (
                  <Link
                    key={film.id}
                    href={href}
                    className="text-sm px-3 py-1.5 border border-neutral-800 text-neutral-300 hover:border-[#D32F2F] hover:text-white transition-colors"
                  >
                    {filmName} <span className="text-neutral-600">({film._count.photos})</span>
                  </Link>
                )
              })}
            </div>
          </section>
        )}

        <div className="mb-10">
          <CommunityNotes targetType="camera" targetId={camera.id} targetLabel={name} />
        </div>

        <div>
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-white">Photos</h2>
            {totalPhotos > 0 && (
              <span className="text-neutral-500 text-sm">
                {totalPhotos} {totalPhotos === 1 ? 'photo' : 'photos'}
              </span>
            )}
          </div>

          <MasonryGrid
            initialPhotos={initialPhotos}
            initialOffset={hasMore ? FEED_FIRST_PAGE : null}
            tab="recent"
            scopeQuery={`&cameraId=${camera.id}`}
          />
        </div>
        <CompletenessNote
          completeness={completeness}
          labelFor={f => ADMIN_RESOURCES.cameras.editable[f as keyof typeof ADMIN_RESOURCES.cameras.editable]?.label ?? f}
        />
      </main>

      <Footer />
    </div>
  )
}
