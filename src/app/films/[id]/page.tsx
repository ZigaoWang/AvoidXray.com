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
      photos: { where: { published: true }, include: { _count: { select: { likes: true } } } }
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
            <div className="w-full md:w-2/5 lg:w-1/3 bg-neutral-900/50 flex items-center justify-center p-8 md:p-12">
              {displayImage ? (
                <div className="relative w-full aspect-[4/3]">
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
            <div className="flex-1 p-6 md:p-8 lg:p-12 flex flex-col justify-between">
              <div>
                {filmStock.brand && (
                  <div className="text-[#D32F2F] text-sm font-bold uppercase tracking-wider mb-2">
                    {filmStock.brand}
                  </div>
                )}
                <h1 className="text-3xl md:text-4xl lg:text-5xl font-black text-white mb-4 tracking-tight">
                  {filmStock.name}
                </h1>

                <div className="flex items-center gap-4 text-neutral-400 mb-6">
                  {filmStock.iso && (
                    <div className="flex items-center gap-2 bg-neutral-900 px-3 py-1.5 rounded border border-neutral-800">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                      <span className="text-sm font-semibold">ISO {filmStock.iso}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <span className="text-lg font-semibold">{shuffledPhotos.length} photos</span>
                  </div>
                </div>

                {/* Film Specs */}
                {(filmStock.filmType || filmStock.format || filmStock.process || filmStock.exposures) && (
                  <div className="grid grid-cols-2 gap-3 mb-6 bg-neutral-900/50 p-4 border border-neutral-800">
                    {filmStock.filmType && (
                      <div>
                        <div className="text-xs text-neutral-500 uppercase tracking-wider mb-1">Type</div>
                        <div className="text-white font-medium">{filmStock.filmType}</div>
                      </div>
                    )}
                    {filmStock.format && (
                      <div>
                        <div className="text-xs text-neutral-500 uppercase tracking-wider mb-1">Format</div>
                        <div className="text-white font-medium">{filmStock.format}</div>
                      </div>
                    )}
                    {filmStock.process && (
                      <div>
                        <div className="text-xs text-neutral-500 uppercase tracking-wider mb-1">Process</div>
                        <div className="text-white font-medium">{filmStock.process}</div>
                      </div>
                    )}
                    {filmStock.exposures && (
                      <div>
                        <div className="text-xs text-neutral-500 uppercase tracking-wider mb-1">Exposures</div>
                        <div className="text-white font-medium">{filmStock.exposures}</div>
                      </div>
                    )}
                  </div>
                )}

                {displayDescription ? (
                  <div className="prose prose-invert prose-sm max-w-none">
                    <p className="text-neutral-300 leading-relaxed whitespace-pre-wrap">
                      {displayDescription}
                    </p>
                  </div>
                ) : (
                  <div className="bg-neutral-900/50 border border-dashed border-neutral-700 p-6 rounded">
                    <p className="text-neutral-500 text-sm mb-3">
                      Help the community by adding an image and description for this film stock!
                    </p>
                  </div>
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
                  format={filmStock.format}
                  iso={filmStock.iso}
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
