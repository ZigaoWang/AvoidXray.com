import { prisma } from '@/lib/db'
import { seededShuffle, dailySeed } from '@/lib/seededShuffle'
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

// Photo order is shuffled per request, so the page can't be statically cached.
// It is still cached at the CDN edge for a short window — long enough to keep
// Googlebot from re-rendering it on every hit, short enough to stay fresh.
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

/** "35mm, Color Negative, ISO 200" — the spec string used in titles. */
function specString(film: {
  format: string | null
  filmType: string | null
  iso: number | null
}): string {
  const specs = [film.format, film.filmType, film.iso ? `ISO ${film.iso}` : null].filter(Boolean)
  return specs.length ? ` (${specs.join(', ')})` : ''
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params
  const filmStock = await lookupFilm(id)
  if (!filmStock) return { title: 'Film Stock Not Found' }

  const name = displayName(filmStock) ?? filmStock.name
  const photoCount = await prisma.photo.count({
    where: { published: true, filmStockId: filmStock.id },
  })

  const title = `${name}${specString(filmStock)}`
  // Lead with the query people actually type: "<film> sample photos".
  const description =
    `${name} sample photos — ${photoCount} real film ${photoCount === 1 ? 'photograph' : 'photographs'} ` +
    `shot on ${name} by the AvoidXray community. See how this ${
      filmStock.filmType?.toLowerCase() ?? 'film'
    } stock renders colour, grain, and contrast before you buy a roll.`

  const canonical = `${SITE_URL}/films/${filmStock.slug ?? filmStock.id}`
  const image = filmStock.imageStatus === 'approved' ? filmStock.imageUrl : null

  return {
    title,
    description,
    keywords: [
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
      ...(image && { images: [{ url: image, alt: gearImageAlt(filmStock, 'film') }] }),
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

  const photos = await prisma.photo.findMany({
    where: { published: true, filmStockId: filmStock.id },
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

  const userLikes = userId
    ? await prisma.like.findMany({
        where: { userId, photoId: { in: photos.map((p) => p.id) } },
        select: { photoId: true },
      })
    : []
  const likedIds = new Set(userLikes.map((l) => l.photoId))

  // Seeded so returning from a photo reproduces the same grid; see seededShuffle.
  const shuffledPhotos = seededShuffle(photos, dailySeed()).map((p) => ({
    ...p,
    filmStock: { name: filmStock.name, brand: filmStock.brand },
    liked: likedIds.has(p.id),
  }))

  // Cameras this film has actually been shot with — powers the long-tail combo
  // pages and gives the crawler real internal links out of this page.
  const pairedCameras = await prisma.camera.findMany({
    where: { photos: { some: { published: true, filmStockId: filmStock.id } } },
    select: {
      id: true,
      name: true,
      brand: true,
      slug: true,
      _count: { select: { photos: { where: { published: true, filmStockId: filmStock.id } } } },
    },
    orderBy: { name: 'asc' },
  })

  const name = displayName(filmStock) ?? filmStock.name
  const displayImage = filmStock.imageStatus === 'approved' ? filmStock.imageUrl : null
  const displayDescription = filmStock.imageStatus === 'approved' ? filmStock.description : null
  const canonicalPath = `/films/${filmStock.slug ?? filmStock.id}`

  const specs = [
    filmStock.iso && { label: 'ISO', value: String(filmStock.iso) },
    filmStock.filmType && { label: 'Type', value: filmStock.filmType },
    filmStock.format && { label: 'Format', value: filmStock.format },
    filmStock.process && { label: 'Process', value: filmStock.process },
    filmStock.exposures && { label: 'Exposures', value: filmStock.exposures },
  ].filter(Boolean) as Array<{ label: string; value: string }>

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex flex-col">
      <JsonLd
        data={[
          breadcrumbJsonLd([
            { name: 'Home', path: '/' },
            { name: 'Film Stocks', path: '/films' },
            { name, path: canonicalPath },
          ]),
          collectionJsonLd({
            name: `Photos shot on ${name}`,
            description: `${photos.length} film photographs shot on ${name}.`,
            path: canonicalPath,
            photos: shuffledPhotos,
            totalPhotos: photos.length,
            // The film stock is the subject of the page, not a standalone entity.
            about: gearJsonLd({
              name,
              description:
                displayDescription ||
                `${name} film stock. ${photos.length} sample photographs shot by the AvoidXray community.`,
              path: canonicalPath,
              imageUrl: displayImage,
              brand: filmStock.brand,
              photoCount: photos.length,
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
            <li className="text-neutral-300">{name}</li>
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
                  {filmStock.name} Sample Photos
                </h1>

                <div className="flex flex-wrap items-center gap-2 mb-4">
                  {specs.map((s) => (
                    <span key={s.label} className="text-xs px-2 py-0.5 border border-neutral-700 text-neutral-300">
                      {s.label === 'ISO' ? `ISO ${s.value}` : s.value}
                    </span>
                  ))}
                  <span className="text-xs text-neutral-500">{photos.length} photos</span>
                </div>

                {/* Server-rendered summary. Without this the page is a bare image
                    grid with nothing for a crawler to read. */}
                <p className="text-neutral-400 text-sm leading-relaxed mb-3">
                  {displayDescription ||
                    `${name} is a ${filmStock.filmType?.toLowerCase() ?? 'film'} stock${
                      filmStock.iso ? ` rated at ISO ${filmStock.iso}` : ''
                    }${filmStock.format ? ` in ${filmStock.format} format` : ''}.`}
                </p>
                <p className="text-neutral-500 text-sm leading-relaxed">
                  This page collects {photos.length} real{' '}
                  {photos.length === 1 ? 'photograph' : 'photographs'} shot on {name} by the
                  AvoidXray community
                  {pairedCameras.length > 0 && (
                    <> across {pairedCameras.length} different {pairedCameras.length === 1 ? 'camera' : 'cameras'}</>
                  )}
                  . Every frame is an unedited scan uploaded by the photographer, so you can judge
                  the stock&rsquo;s real colour, grain, and latitude before buying a roll.
                </p>
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
                  format={filmStock.format}
                  iso={filmStock.iso}
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
            <h2 className="text-lg font-bold text-white mb-4">Cameras used with {name}</h2>
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
            <h2 className="text-2xl font-bold text-white">Photos Shot On {name}</h2>
            {photos.length > 0 && (
              <span className="text-neutral-500 text-sm">
                {photos.length} {photos.length === 1 ? 'photo' : 'photos'}
              </span>
            )}
          </div>

          <MasonryGrid photos={shuffledPhotos} />
        </div>
      </main>

      <Footer />
    </div>
  )
}
