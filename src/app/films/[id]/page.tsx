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
import { resolveFilmSlug, lookupFilm, canonicalCameraPath } from '@/lib/seo/resolve'
import { breadcrumbJsonLd, collectionJsonLd, gearJsonLd } from '@/lib/seo/jsonld'
import { displayName, gearImageAlt } from '@/lib/seo/alt'
import { SITE_URL, comboUrl } from '@/lib/seo/site'
import { FEED_FIRST_PAGE } from '@/lib/photoFeed'
import { colorBalanceLabel, filmFormatLabel, filmProcessLabel } from '@/lib/filmFields'
import { usefulAliases } from '@/lib/filmSearch'
import type { FilmProcess } from '@prisma/client'
import { PUBLIC_PHOTO } from '@/lib/photoVisibility'
import { hiddenPhotoFilter } from '@/lib/blocks'
import ManufacturerValue from '@/components/ManufacturerValue'
import { textLinkClass } from '@/components/ui/TextLink'
import SourceLink from '@/components/SourceLink'
import CompletenessNote from '@/components/CompletenessNote'
import { completenessOf, NOT_YET_STARTED } from '@/lib/completeness'
import { ADMIN_RESOURCES } from '@/lib/admin/resources'
import { MANUFACTURER_EXPLAINER } from '@/lib/manufacturer'

// Photo order is shuffled per request, so the page can't be statically cached.
// It is still cached at the CDN edge for a short window — long enough to keep
// Googlebot from re-rendering it on every hit, short enough to stay fresh.
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

/** "35mm, C-41, ISO 200" — the spec string used in titles. */
function specString(film: {
  format: string[]
  process: FilmProcess | null
  iso: number | null
}): string {
  const specs = [
    film.format.join('/') || null,
    filmProcessLabel(film.process),
    film.iso ? `ISO ${film.iso}` : null,
  ].filter(Boolean)
  return specs.length ? ` (${specs.join(', ')})` : ''
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params
  const filmStock = await lookupFilm(id)
  if (!filmStock) return { title: 'Film Stock Not Found' }

  const name = displayName(filmStock) ?? filmStock.name
  const photoCount = await prisma.photo.count({
    where: { ...PUBLIC_PHOTO, filmStockId: filmStock.id },
  })

  const title = `${name}${specString(filmStock)}`
  // Lead with the query people actually type: "<film> sample photos".
  const description =
    `${name} sample photos: ${photoCount} real film ${photoCount === 1 ? 'photograph' : 'photographs'} ` +
    `shot on ${name} by the AvoidXray community. See how this ${
      filmStock.filmType?.toLowerCase() ?? 'film'
    } stock renders color, grain, and contrast before you buy a roll.`

  const canonical = `${SITE_URL}/films/${filmStock.slug ?? filmStock.id}`

  // Deliberately no `openGraph.images` / `twitter.images` here. Pointing them
  // at filmStock.imageUrl handed every platform a tall product shot on a plain
  // background, which Instagram cropped to a wide strip of packaging with the
  // name off-frame. opengraph-image.tsx in this folder renders a 1200x630 card
  // instead — and an explicit `images` value would override that file.
  return {
    title,
    description,
    keywords: [
      ...filmStock.aliases.flatMap((a) => [a, `${a} sample photos`]),
      `${name} sample photos`,
      `${name} sample images`,
      `shot on ${name}`,
      `${name} review`,
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

export default async function FilmDetailPage({ params }: Params) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  const userId = (session?.user as { id?: string } | undefined)?.id

  // Redirects legacy cuid URLs to the slug form.
  const filmStock = await resolveFilmSlug(id)
  if (!filmStock) notFound()

  // Blocked in either direction. /api/photos already applies this to every
  // page after the first, so without it here the first screen showed accounts
  // that vanished as soon as the reader scrolled.
  const hidden = await hiddenPhotoFilter(userId)

  // Only the first screen. MasonryGrid pages the rest through /api/photos,
  // the same way explore does, instead of serializing every photo here.
  const photos = await prisma.photo.findMany({
    where: { ...PUBLIC_PHOTO, ...hidden, filmStockId: filmStock.id },
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
      camera: { select: { name: true, brand: true } },
      user: { select: { name: true, username: true } },
      _count: { select: { likes: true } },
    },
  })

  const totalPhotos = await prisma.photo.count({
    where: { ...PUBLIC_PHOTO, ...hidden, filmStockId: filmStock.id },
  })

  const userLikes = userId
    ? await prisma.like.findMany({
        where: { userId, photoId: { in: photos.map((p) => p.id) } },
        select: { photoId: true },
      })
    : []
  const likedIds = new Set(userLikes.map((l) => l.photoId))

  // Seeded so returning from a photo reproduces the same grid; see seededShuffle.
  const hasMore = photos.length > FEED_FIRST_PAGE
  const initialPhotos = (hasMore ? photos.slice(0, FEED_FIRST_PAGE) : photos).map((p) => ({
    ...p,
    filmStock: { name: filmStock.name, brand: filmStock.brand },
    liked: likedIds.has(p.id),
  }))

  // Cameras this film has actually been shot with — powers the long-tail combo
  // pages and gives the crawler real internal links out of this page.
  const pairedCameras = await prisma.camera.findMany({
    where: { photos: { some: { ...PUBLIC_PHOTO, filmStockId: filmStock.id } } },
    select: {
      id: true,
      name: true,
      brand: true,
      slug: true,
      _count: { select: { photos: { where: { ...PUBLIC_PHOTO, filmStockId: filmStock.id } } } },
    },
    orderBy: { name: 'asc' },
  })

  // The brands either side of the manufacturer question, and the source behind
  // the claim when there is one. Read together so the row can always render.
  const [brands, citations] = await Promise.all([
    prisma.brand.findMany({
      where: { id: { in: [filmStock.brandId, filmStock.manufacturedByBrandId].filter((v): v is string => !!v) } },
      select: { id: true, name: true },
    }),
    // Every field on this stock that carries a citation. Absence is the
    // ordinary case and is left unmarked.
    prisma.fieldProvenance.findMany({
      where: { entityType: 'FILM_STOCK', entityId: filmStock.id },
      select: { fieldName: true, sourceUrl: true, claims: true },
    }),
  ])
  const sourceFor = new Map(
    citations.filter(c => c.sourceUrl).map(c => [c.fieldName, c.sourceUrl])
  )
  // Every claim across every field, for the composition shown at the foot.
  const allClaims = citations.flatMap(
    c => (c.claims ?? []) as Array<{ url?: string | null; editorial?: boolean | null }>
  )
  const completeness = completenessOf('FILM_STOCK', filmStock as unknown as Record<string, unknown>, new Set(sourceFor.keys()), allClaims, NOT_YET_STARTED)
  const brandName = brands.find(b => b.id === filmStock.brandId)?.name ?? filmStock.name
  const manufacturerName = brands.find(b => b.id === filmStock.manufacturedByBrandId)?.name ?? null

  // Lineage runs both ways. A respool points at what it came from, and the
  // source stock lists what is made from it, which is the half nobody else
  // publishes: the Vision3 page is where you learn what it gets rebranded as.
  const [parentStock, respools, variants] = await Promise.all([
    filmStock.parentStockId
      ? prisma.filmStock.findUnique({
          where: { id: filmStock.parentStockId },
          select: { id: true, slug: true, name: true },
        })
      : null,
    prisma.filmStock.findMany({
      where: { parentStockId: filmStock.id },
      select: { id: true, slug: true, name: true },
      orderBy: { name: 'asc' },
    }),
    prisma.filmVariant.findMany({
      where: { filmStockId: filmStock.id },
      select: { format: true, exposures: true, sheetCount: true },
      orderBy: { format: 'asc' },
    }),
  ])

  const name = displayName(filmStock) ?? filmStock.name
  const displayImage = filmStock.imageStatus === 'approved' ? filmStock.imageUrl : null
  const displayDescription = filmStock.imageStatus === 'approved' ? filmStock.description : null
  const canonicalPath = `/films/${filmStock.slug ?? filmStock.id}`

  // Aliases that add something the name does not already say.
  const alternateNames = usefulAliases(name, filmStock.aliases)

  const processLabel = filmProcessLabel(filmStock.process)
  const balanceLabel = colorBalanceLabel(filmStock.colorBalance)

  // Chips are read at a glance, so each one has to stand on its own.
  //
  //  - A bare "N/A" told the reader nothing. Color balance is not applicable
  //    to black and white, and the absence of the chip says that better than
  //    the words do.
  //  - "B&W" (process) next to "Black & White" (the older free-text type) said
  //    the same thing twice, so the type is dropped when the process already
  //    covers it.
  //  - Values that are not self-describing carry their label; "C-41", "35mm"
  //    and "ISO 400" do not need one.
  const typeIsRedundant =
    !filmStock.filmType ||
    (processLabel === 'B&W' && /black\s*&?\s*(and)?\s*white/i.test(filmStock.filmType))

  const specs = [
    processLabel && { label: 'Process', value: processLabel, showLabel: false },
    filmStock.iso && { label: 'ISO', value: `ISO ${filmStock.iso}`, showLabel: false },
    // N/A is deliberately not shown: "not applicable" is not a specification.
    balanceLabel && balanceLabel !== 'N/A'
      ? {
          label: 'Balance',
          value: balanceLabel,
          showLabel: true,
          sourceUrl: sourceFor.get('colorBalance') ?? null,
        }
      : null,
    !typeIsRedundant && { label: 'Type', value: filmStock.filmType!, showLabel: false },
    filmStock.format.length > 0 && {
      label: 'Format',
      value: filmStock.format.join(', '),
      showLabel: false,
    },
    filmStock.exposures && {
      label: 'Exposures',
      value: `${filmStock.exposures} exp`,
      showLabel: false,
    },
  ].filter(Boolean) as Array<{
    label: string
    value: string
    showLabel: boolean
    sourceUrl?: string | null
  }>

  return (
    <div className="min-h-dvh bg-[#0a0a0a] flex flex-col">
      <JsonLd
        data={[
          breadcrumbJsonLd([
            { name: 'Home', path: '/' },
            { name: 'Film Stocks', path: '/films' },
            { name, path: canonicalPath },
          ]),
          collectionJsonLd({
            name: `Photos shot on ${name}`,
            description: `${totalPhotos} film photographs shot on ${name}.`,
            path: canonicalPath,
            photos: initialPhotos,
            totalPhotos,
            // The film stock is the subject of the page, not a standalone entity.
            about: gearJsonLd({
              name,
              description:
                displayDescription ||
                `${name} film stock. ${totalPhotos} sample photographs shot by the AvoidXray community.`,
              path: canonicalPath,
              imageUrl: displayImage,
              brand: filmStock.brand,
              photoCount: totalPhotos,
              category: 'Photographic film',
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
            <li><Link href="/films" className="hover:text-white">Film Stocks</Link></li>
            <li aria-hidden>/</li>
            <li aria-current="page" className="text-neutral-300">{name}</li>
          </ol>
        </nav>

        {/* Hero Section */}
        <div className="bg-gradient-to-br from-neutral-900 to-neutral-950 border border-neutral-800 overflow-hidden mb-8">
          <div className="flex flex-col md:flex-row">
            <div className="w-full md:w-2/5 lg:w-1/3 bg-neutral-900/50 flex items-center justify-center min-h-[200px] p-6 md:p-0">
              {displayImage ? (
                <div className="relative w-full h-full min-h-[200px]">
                  <Image
                    src={displayImage}
                    alt={gearImageAlt(filmStock, 'film')}
                    fill
                    className="object-contain"
                    priority
                  />
                </div>
              ) : (
                <div className="w-full aspect-[4/3] flex items-center justify-center">
                  <svg className="w-24 h-24 text-neutral-700" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
                  </svg>
                </div>
              )}
            </div>

            <div className="flex-1 p-6 md:p-8 flex flex-col justify-between">
              <div>
                {filmStock.brand && (
                  <div className="text-[#D32F2F] text-xs font-medium uppercase tracking-widest mb-1">{filmStock.brand}</div>
                )}
                <h1 className="text-2xl md:text-3xl font-bold text-white mb-3 tracking-tight leading-tight">
                  {filmStock.name}
                </h1>

                <div className="flex flex-wrap items-center gap-2 mb-4">
                  {specs.map((s) => (
                    <span
                      key={s.label}
                      className="text-xs px-2 py-0.5 border border-neutral-700 text-neutral-300"
                    >
                      {s.showLabel && <span className="text-neutral-500">{s.label} </span>}
                      {s.value}
                      <SourceLink url={s.sourceUrl} />
                    </span>
                  ))}
                  <span className="text-xs text-neutral-500">{totalPhotos} photos</span>
                </div>

                {/* Always rendered, even when nobody has established the answer.
                    A row that disappears on the common case makes "not
                    confirmed" and "never filled in" look the same, and they are
                    different claims. */}
                <div className="mb-4 flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <span className="text-xs uppercase tracking-wide text-neutral-500">Manufacturer</span>
                  <ManufacturerValue
                    status={filmStock.manufacturerStatus}
                    brandName={brandName}
                    manufacturerName={manufacturerName}
                    sourceUrl={sourceFor.get('manufacturerStatus')}
                  />
                  {/* Explained only where there is something to explain. On a
                      stock whose brand coats its own film the row reads as the
                      name under the name, and needs no essay. */}
                  {filmStock.manufacturerStatus !== 'SAME_AS_BRAND' && (
                    <p className="w-full text-[11px] leading-relaxed text-neutral-600">
                      {MANUFACTURER_EXPLAINER}
                    </p>
                  )}
                </div>

                {variants.length > 0 && (
                  <div className="mb-4 flex flex-wrap items-baseline gap-x-2">
                    <span className="text-xs uppercase tracking-wide text-neutral-500">Sold in</span>
                    <span className="text-sm text-neutral-200">
                      {variants
                        .map(v => {
                          const label = filmFormatLabel(v.format)
                          const count = v.exposures ?? v.sheetCount
                          const unit = v.exposures ? 'exposures' : 'sheets'
                          return count ? `${label} (${count} ${unit})` : label
                        })
                        .join(', ')}
                    </span>
                  </div>
                )}

                {(parentStock || respools.length > 0) && (
                  <div className="mb-4 space-y-1">
                    {parentStock && (
                      <p className="text-sm text-neutral-400">
                        <span className="text-xs uppercase tracking-wide text-neutral-500">Respooled from </span>
                        <Link href={`/films/${parentStock.slug ?? parentStock.id}`} className={textLinkClass}>
                          {parentStock.name}
                        </Link>
                        {filmStock.respoolNotes && (
                          <span className="block text-[11px] leading-relaxed text-neutral-600 mt-1">
                            {filmStock.respoolNotes}
                          </span>
                        )}
                      </p>
                    )}
                    {respools.length > 0 && (
                      <p className="text-sm text-neutral-400">
                        <span className="text-xs uppercase tracking-wide text-neutral-500">Also sold as </span>
                        {respools.map((r, i) => (
                          <span key={r.id}>
                            {i > 0 && ', '}
                            <Link href={`/films/${r.slug ?? r.id}`} className={textLinkClass}>{r.name}</Link>
                          </span>
                        ))}
                      </p>
                    )}
                  </div>
                )}

                {/* The stock's own description. Keywords for search live in the
                    title, meta description and structured data, which readers
                    never see — not in body copy written at the crawler. */}
                <p className="text-neutral-400 text-sm leading-relaxed">
                  {displayDescription ||
                    `${name} is a ${filmStock.filmType?.toLowerCase() ?? 'film'} stock${
                      filmStock.iso ? ` rated at ISO ${filmStock.iso}` : ''
                    }${
                      // format became an array, and an empty one is still
                      // truthy — this read " in  format" for any stock without
                      // one, and "35mm,120" for any stock with two.
                      filmStock.format.length > 0
                        ? ` in ${filmStock.format.join(' and ')} format`
                        : ''
                    }.`}
                </p>

                {/* Alternate names and product codes. Useful to a reader who
                    knows the stock as "5219", and it puts that string on the
                    page for anyone searching it. */}
                {alternateNames.length > 0 && (
                  <p className="mt-3 text-sm text-neutral-500">
                    Also known as{' '}
                    <span className="text-neutral-300">{alternateNames.join(', ')}</span>
                  </p>
                )}
              </div>

              <div className="mt-6">
                <SuggestEditButton
                  type="filmstock"
                  id={filmStock.id}
                  name={filmStock.name}
                  brand={filmStock.brand}
                  currentImage={displayImage}
                  currentDescription={displayDescription}
                  filmType={filmStock.filmType}
                  format={filmStock.format[0] ?? null}
                  iso={filmStock.iso}
                  exposures={filmStock.exposures}
                  process={filmProcessLabel(filmStock.process)}
                  colorBalance={colorBalanceLabel(filmStock.colorBalance)}
                  manufacturer={filmStock.manufacturer}
                  aliases={filmStock.aliases}
                  noDescription={!displayDescription}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Cameras this film has been shot with — internal links into the
            long-tail combination pages. */}
        {pairedCameras.length > 0 && (
          <section className="mb-10">
            <h2 className="text-lg font-bold text-white mb-4">Shot with</h2>
            <div className="flex flex-wrap gap-2">
              {pairedCameras.map((cam) => {
                const camName = displayName(cam) ?? cam.name
                return cam.slug && filmStock.slug ? (
                  <Link
                    key={cam.id}
                    href={comboUrl(filmStock.slug, cam.slug)}
                    className="text-sm px-3 py-1.5 border border-neutral-800 text-neutral-300 hover:border-[#D32F2F] hover:text-white transition-colors"
                  >
                    {camName} <span className="text-neutral-600">({cam._count.photos})</span>
                  </Link>
                ) : (
                  <Link
                    key={cam.id}
                    href={canonicalCameraPath(cam)}
                    className="text-sm px-3 py-1.5 border border-neutral-800 text-neutral-300 hover:border-[#D32F2F] hover:text-white transition-colors"
                  >
                    {camName} <span className="text-neutral-600">({cam._count.photos})</span>
                  </Link>
                )
              })}
            </div>
          </section>
        )}

        <div className="mb-10">
          <CommunityNotes
            targetType="filmstock"
            targetId={filmStock.id}
            targetLabel={name}
          />
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
            scopeQuery={`&filmStockId=${filmStock.id}`}
          />
        </div>
        <CompletenessNote
          completeness={completeness}
          labelFor={f => ADMIN_RESOURCES.films.editable[f as keyof typeof ADMIN_RESOURCES.films.editable]?.label ?? f}
        />
      </main>

      <Footer />
    </div>
  )
}
