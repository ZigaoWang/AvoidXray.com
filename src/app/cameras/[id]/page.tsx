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
import { displayName, gearImageAlt } from '@/lib/seo/alt'
import { SITE_URL, comboUrl } from '@/lib/seo/site'

export const dynamic = 'force-dynamic'

/**
 * Fisher-Yates. Kept as a named helper rather than an inline
 * `sort(() => Math.random() - 0.5)`: that comparator is both biased and flagged
 * as an impure call during render.
 */
function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }
  return shuffled
}

type Params = { params: Promise<{ id: string }> }

function specString(camera: { cameraType: string | null; format: string | null; year: number | null }) {
  const specs = [camera.cameraType, camera.format, camera.year ? String(camera.year) : null].filter(Boolean)
  return specs.length ? ` (${specs.join(', ')})` : ''
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params
  const camera = await lookupCamera(id)
  if (!camera) return { title: 'Camera Not Found' }

  const name = displayName(camera) ?? camera.name
  const photoCount = await prisma.photo.count({ where: { published: true, cameraId: camera.id } })

  const title = `${name}${specString(camera)}`
  const description =
    `${name} sample photos — ${photoCount} real film ${photoCount === 1 ? 'photograph' : 'photographs'} ` +
    `shot on a ${name} by the AvoidXray community. See what this ${
      camera.cameraType?.toLowerCase() ?? 'film camera'
    } actually produces before you buy one.`

  const canonical = `${SITE_URL}/cameras/${camera.slug ?? camera.id}`
  const image = camera.imageStatus === 'approved' ? camera.imageUrl : null

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
      ...(image && { images: [{ url: image, alt: gearImageAlt(camera, 'camera') }] }),
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

  const photos = await prisma.photo.findMany({
    where: { published: true, cameraId: camera.id },
    select: {
      id: true,
      thumbnailPath: true,
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

  const userLikes = userId
    ? await prisma.like.findMany({
        where: { userId, photoId: { in: photos.map((p) => p.id) } },
        select: { photoId: true },
      })
    : []
  const likedIds = new Set(userLikes.map((l) => l.photoId))

  const shuffledPhotos = shuffleArray(photos).map((p) => ({
      ...p,
      camera: { name: camera.name, brand: camera.brand },
      liked: likedIds.has(p.id),
    }))

  // Films actually shot on this body — the reverse side of the combo pages.
  const pairedFilms = await prisma.filmStock.findMany({
    where: { photos: { some: { published: true, cameraId: camera.id } } },
    select: {
      id: true,
      name: true,
      brand: true,
      slug: true,
      _count: { select: { photos: { where: { published: true, cameraId: camera.id } } } },
    },
    orderBy: { name: 'asc' },
  })

  const name = displayName(camera) ?? camera.name
  const displayImage = camera.imageStatus === 'approved' ? camera.imageUrl : null
  const displayDescription = camera.imageStatus === 'approved' ? camera.description : null
  const canonicalPath = `/cameras/${camera.slug ?? camera.id}`

  const specs = [
    camera.cameraType && { label: 'Type', value: camera.cameraType },
    camera.format && { label: 'Format', value: camera.format },
    camera.mountType && { label: 'Mount', value: camera.mountType },
    camera.year && { label: 'Year', value: String(camera.year) },
  ].filter(Boolean) as Array<{ label: string; value: string }>

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex flex-col">
      <JsonLd
        data={[
          breadcrumbJsonLd([
            { name: 'Home', path: '/' },
            { name: 'Cameras', path: '/cameras' },
            { name, path: canonicalPath },
          ]),
          gearJsonLd({
            name,
            description:
              displayDescription ||
              `${name} film camera. ${photos.length} sample photographs shot by the AvoidXray community.`,
            path: canonicalPath,
            imageUrl: displayImage,
            brand: camera.brand,
            photoCount: photos.length,
            category: 'Film camera',
            properties: specs.map((s) => ({ name: s.label, value: s.value })),
          }),
          collectionJsonLd({
            name: `Photos shot on a ${name}`,
            description: `${photos.length} film photographs shot on a ${name}.`,
            path: canonicalPath,
            photos: shuffledPhotos,
            totalPhotos: photos.length,
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
            <li className="text-neutral-300">{name}</li>
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
                  {camera.name} Sample Photos
                </h1>

                <div className="flex flex-wrap items-center gap-2 mb-4">
                  {specs.map((s) => (
                    <span key={s.label} className="text-xs px-2 py-0.5 border border-neutral-700 text-neutral-300">
                      {s.value}
                    </span>
                  ))}
                  <span className="text-xs text-neutral-500">{photos.length} photos</span>
                </div>

                <p className="text-neutral-400 text-sm leading-relaxed mb-3">
                  {displayDescription ||
                    `${name} is a ${camera.cameraType?.toLowerCase() ?? 'film camera'}${
                      camera.format ? ` shooting ${camera.format}` : ''
                    }${camera.year ? `, introduced in ${camera.year}` : ''}.`}
                </p>
                <p className="text-neutral-500 text-sm leading-relaxed">
                  This page collects {photos.length} real{' '}
                  {photos.length === 1 ? 'photograph' : 'photographs'} shot on a {name} by the
                  AvoidXray community
                  {pairedFilms.length > 0 && (
                    <> across {pairedFilms.length} different film {pairedFilms.length === 1 ? 'stock' : 'stocks'}</>
                  )}
                  . Every frame is an unedited scan uploaded by the photographer, so you can see how
                  this body actually renders before buying one.
                </p>
              </div>

              <div className="mt-6">
                <SuggestEditButton
                  type="camera"
                  id={camera.id}
                  name={camera.name}
                  brand={camera.brand}
                  currentImage={displayImage}
                  currentDescription={displayDescription}
                  cameraType={camera.cameraType}
                  format={camera.format}
                  year={camera.year}
                  defaultFilmStockId={camera.defaultFilmStockId}
                  noDescription={!displayDescription}
                />
              </div>
            </div>
          </div>
        </div>

        {pairedFilms.length > 0 && (
          <section className="mb-10">
            <h2 className="text-lg font-bold text-white mb-4">Film stocks shot on the {name}</h2>
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
            <h2 className="text-2xl font-bold text-white">Photos Shot With The {name}</h2>
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
