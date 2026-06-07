import { prisma } from '@/lib/db'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import SuggestEditButton from '@/components/SuggestEditButton'
import MasonryGrid from '@/components/MasonryGrid'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import type { Metadata } from 'next'

// Force dynamic rendering so shuffle is different each request
export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params
  const filmStock = await prisma.filmStock.findUnique({
    where: { id },
  })

  if (!filmStock) {
    return { title: 'Film Stock Not Found' }
  }

  const name = filmStock.brand ? `${filmStock.brand} ${filmStock.name}` : filmStock.name

  // Build format string like "35mm, Color Negative, ISO 400"
  const specs = []
  if (filmStock.format) specs.push(filmStock.format)
  if (filmStock.filmType) specs.push(filmStock.filmType)
  if (filmStock.iso) specs.push(`ISO ${filmStock.iso}`)
  const specsStr = specs.length > 0 ? ` (${specs.join(', ')})` : ''

  const title = `${name}${specsStr}`
  const description = `Photos shot on ${name}, uploaded by the AvoidXray community.`

  return {
    title,
    description,
    openGraph: {
      title: `${name} – AvoidXray`,
      description,
      type: 'website',
      url: `https://avoidxray.com/films/${id}`,
      ...(filmStock.imageUrl && filmStock.imageStatus === 'approved' && {
        images: [{ url: filmStock.imageUrl, alt: name }],
      }),
    },
    twitter: {
      card: 'summary_large_image',
      title: name,
      description,
    },
    alternates: {
      canonical: `https://avoidxray.com/films/${id}`,
    },
  }
}

// Fisher-Yates shuffle
function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }
  return shuffled
}

export default async function FilmDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  const userId = (session?.user as { id?: string } | undefined)?.id

  const filmStock = await prisma.filmStock.findUnique({
    where: { id },
    include: {
      photos: {
        where: { published: true },
        select: {
          id: true,
          thumbnailPath: true,
          width: true,
          height: true,
          blurHash: true,
          _count: { select: { likes: true } }
        }
      }
    }
  })

  if (!filmStock) notFound()

  // Get user's likes
  const userLikes = userId ? await prisma.like.findMany({
    where: { userId, photoId: { in: filmStock.photos.map(p => p.id) } },
    select: { photoId: true }
  }) : []
  const likedIds = new Set(userLikes.map(l => l.photoId))

  // Shuffle photos and add liked status
  const shuffledPhotos = shuffleArray(filmStock.photos).map(p => ({
    ...p,
    liked: likedIds.has(p.id)
  }))

  // Only show approved images
  const displayImage = filmStock.imageStatus === 'approved' ? filmStock.imageUrl : null
  const displayDescription = filmStock.imageStatus === 'approved' ? filmStock.description : null

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex flex-col">
      <Header />

      <main className="flex-1 max-w-7xl mx-auto w-full py-8 md:py-16 px-4 md:px-6">
        <Link href="/films" className="text-neutral-500 hover:text-white text-sm mb-6 inline-block">
          &larr; All Films
        </Link>

        {/* Hero Section */}
        <div className="bg-gradient-to-br from-neutral-900 to-neutral-950 border border-neutral-800 overflow-hidden mb-8">
          <div className="flex flex-col md:flex-row">
            {/* Image */}
            <div className="w-full md:w-2/5 lg:w-1/3 bg-neutral-900/50 flex items-center justify-center min-h-[200px] p-6 md:p-0">
              {displayImage ? (
                <div className="relative w-full h-full min-h-[200px]">
                  <Image
                    src={displayImage}
                    alt={filmStock.name}
                    fill
                    className="object-contain"
                    priority
                  />
                </div>
              ) : (
                <div className="w-full aspect-[4/3] flex items-center justify-center">
                  <svg
                    className="w-24 h-24 text-neutral-700"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01"
                    />
                  </svg>
                </div>
              )}
            </div>

            {/* Info */}
            <div className="flex-1 p-6 md:p-8 flex flex-col justify-between">
              <div>
                {filmStock.brand && (
                  <div className="text-[#D32F2F] text-xs font-medium uppercase tracking-widest mb-1">{filmStock.brand}</div>
                )}
                <h1 className="text-2xl md:text-3xl font-bold text-white mb-3 tracking-tight leading-tight">
                  {filmStock.name}
                </h1>

                {/* Specs row */}
                <div className="flex flex-wrap items-center gap-2 mb-4">
                  {filmStock.iso && (
                    <span className="text-xs px-2 py-0.5 border border-neutral-700 text-neutral-300">ISO {filmStock.iso}</span>
                  )}
                  {filmStock.filmType && (
                    <span className="text-xs px-2 py-0.5 border border-neutral-700 text-neutral-300">{filmStock.filmType}</span>
                  )}
                  {filmStock.format && (
                    <span className="text-xs px-2 py-0.5 border border-neutral-700 text-neutral-300">{filmStock.format}</span>
                  )}
                  {filmStock.process && (
                    <span className="text-xs px-2 py-0.5 border border-neutral-700 text-neutral-300">{filmStock.process}</span>
                  )}
                  {filmStock.exposures && (
                    <span className="text-xs px-2 py-0.5 border border-neutral-700 text-neutral-300">{filmStock.exposures} exp</span>
                  )}
                  <span className="text-xs text-neutral-500">{shuffledPhotos.length} photos</span>
                </div>

                {displayDescription ? (
                  <p className="text-neutral-400 text-sm leading-relaxed">{displayDescription}</p>
                ) : null}
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

        {/* Photos */}
        <div>
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-white">Photos Shot On This Film</h2>
            {shuffledPhotos.length > 0 && (
              <span className="text-neutral-500 text-sm">{shuffledPhotos.length} {shuffledPhotos.length === 1 ? 'photo' : 'photos'}</span>
            )}
          </div>

          <MasonryGrid photos={shuffledPhotos} />
        </div>
      </main>

      <Footer />
    </div>
  )
}
