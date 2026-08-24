import { prisma } from '@/lib/db'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import MasonryGrid from '@/components/MasonryGrid'
import JsonLd from '@/components/JsonLd'
import type { Metadata } from 'next'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { lookupFilm, lookupCamera, canonicalFilmPath, canonicalCameraPath } from '@/lib/seo/resolve'
import { breadcrumbJsonLd, collectionJsonLd } from '@/lib/seo/jsonld'
import { displayName, article } from '@/lib/seo/alt'
import { SITE_URL, comboUrl } from '@/lib/seo/site'
import { FEED_FIRST_PAGE } from '@/lib/photoFeed'

/**
 * Film x camera combination page: /films/kodak-gold-200/shot-with/nikon-fm2
 *
 * This is the long-tail shape people actually search ("portra 400 on a canon
 * ae-1"), and it's the pattern Lomography leans on heavily. Pages only exist for
 * pairs that have real photos behind them; anything thinner 404s rather than
 * adding another near-empty URL to the index.
 */

export const dynamic = 'force-dynamic'

/** Below this, the page has too little content to deserve indexing. */
const MIN_PHOTOS = 3

type Params = { params: Promise<{ id: string; camera: string }> }

async function load(params: Params['params']) {
  const { id, camera: cameraParam } = await params

  const [film, camera] = await Promise.all([lookupFilm(id), lookupCamera(cameraParam)])
  if (!film || !camera) return null

  const count = await prisma.photo.count({
    where: { published: true, filmStockId: film.id, cameraId: camera.id },
  })
  if (count < MIN_PHOTOS) return null

  return { film, camera, count }
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const data = await load(params)
  if (!data) return { title: 'Not Found', robots: { index: false, follow: false } }

  const { film, camera, count } = data
  const filmName = displayName(film) ?? film.name
  const cameraName = displayName(camera) ?? camera.name

  const title = `${filmName} shot on ${article(cameraName)} ${cameraName}`
  const description =
    `${count} sample photos of ${filmName} shot on ${article(cameraName)} ${cameraName}. See exactly how this ` +
    `film-and-camera combination renders colour, grain, and contrast — real scans uploaded by ` +
    `AvoidXray photographers, not marketing samples.`

  const canonical = `${SITE_URL}${comboUrl(film.slug!, camera.slug!)}`

  return {
    title,
    description,
    keywords: [
      `${filmName} ${cameraName}`,
      `${filmName} on ${cameraName}`,
      `${cameraName} ${filmName} sample photos`,
      `${filmName} sample photos`,
    ],
    openGraph: { title, description, type: 'website', url: canonical },
    twitter: { card: 'summary_large_image', title, description },
    alternates: { canonical },
  }
}

export default async function ComboPage({ params }: Params) {
  const data = await load(params)
  if (!data) notFound()

  const { film, camera, count } = data
  const session = await getServerSession(authOptions)
  const userId = (session?.user as { id?: string } | undefined)?.id

  // Only the first screen; MasonryGrid pages the rest through /api/photos.
  const photos = await prisma.photo.findMany({
    where: { published: true, filmStockId: film.id, cameraId: camera.id },
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
      user: { select: { name: true, username: true } },
      _count: { select: { likes: true } },
    },
    orderBy: { createdAt: 'desc' },
  })

  const userLikes = userId
    ? await prisma.like.findMany({
        where: { userId, photoId: { in: photos.map((p) => p.id) } },
        select: { photoId: true },
      })
    : []
  const likedIds = new Set(userLikes.map((l) => l.photoId))

  const filmName = displayName(film) ?? film.name
  const cameraName = displayName(camera) ?? camera.name
  const path = comboUrl(film.slug!, camera.slug!)

  const hasMore = photos.length > FEED_FIRST_PAGE
  const gridPhotos = (hasMore ? photos.slice(0, FEED_FIRST_PAGE) : photos).map((p) => ({
    ...p,
    filmStock: { name: film.name, brand: film.brand },
    camera: { name: camera.name, brand: camera.brand },
    liked: likedIds.has(p.id),
  }))

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex flex-col">
      <JsonLd
        data={[
          breadcrumbJsonLd([
            { name: 'Home', path: '/' },
            { name: 'Film Stocks', path: '/films' },
            { name: filmName, path: canonicalFilmPath(film) },
            { name: `Shot with ${cameraName}`, path },
          ]),
          collectionJsonLd({
            name: `${filmName} shot on ${article(cameraName)} ${cameraName}`,
            description: `${count} film photographs shot on ${filmName} with ${article(cameraName)} ${cameraName}.`,
            path,
            photos: gridPhotos,
            totalPhotos: count,
          }),
        ]}
      />
      <Header />

      <main className="flex-1 max-w-7xl mx-auto w-full py-8 md:py-16 px-4 md:px-6">
        <nav aria-label="Breadcrumb" className="text-sm mb-6">
          <ol className="flex flex-wrap items-center gap-2 text-neutral-500">
            <li><Link href="/" className="hover:text-white">Home</Link></li>
            <li aria-hidden>/</li>
            <li><Link href="/films" className="hover:text-white">Film Stocks</Link></li>
            <li aria-hidden>/</li>
            <li><Link href={canonicalFilmPath(film)} className="hover:text-white">{filmName}</Link></li>
            <li aria-hidden>/</li>
            <li className="text-neutral-300">{cameraName}</li>
          </ol>
        </nav>

        <header className="mb-8">
          <h1 className="text-3xl md:text-4xl font-black text-white tracking-tight mb-3">
            {filmName} shot on {article(cameraName)} {cameraName}
          </h1>
          <p className="text-neutral-400 leading-relaxed max-w-3xl">
            {count} {count === 1 ? 'photograph' : 'photographs'} shot on {filmName}
            {film.iso ? ` (ISO ${film.iso})` : ''} using {article(cameraName)} {cameraName}
            {camera.cameraType ? `, a ${camera.cameraType.toLowerCase()}` : ''}
            {camera.year ? ` from ${camera.year}` : ''}.
          </p>

          <div className="flex flex-wrap gap-2 mt-5">
            <Link
              href={canonicalFilmPath(film)}
              className="text-sm px-3 py-1.5 border border-neutral-800 text-neutral-300 hover:border-[#D32F2F] hover:text-white transition-colors"
            >
              All {filmName} photos
            </Link>
            <Link
              href={canonicalCameraPath(camera)}
              className="text-sm px-3 py-1.5 border border-neutral-800 text-neutral-300 hover:border-[#D32F2F] hover:text-white transition-colors"
            >
              All {cameraName} photos
            </Link>
          </div>
        </header>

        <MasonryGrid
          initialPhotos={gridPhotos}
          initialOffset={hasMore ? FEED_FIRST_PAGE : null}
          tab="recent"
          scopeQuery={`&filmStockId=${film.id}&cameraId=${camera.id}`}
        />
      </main>

      <Footer />
    </div>
  )
}
