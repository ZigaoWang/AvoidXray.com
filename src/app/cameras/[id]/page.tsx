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
  const camera = await prisma.camera.findUnique({
    where: { id },
  })

  if (!camera) {
    return { title: 'Camera Not Found' }
  }

  const name = camera.brand ? `${camera.brand} ${camera.name}` : camera.name

  // Build specs string like "35mm, SLR, 1985"
  const specs = []
  if (camera.format) specs.push(camera.format)
  if (camera.cameraType) specs.push(camera.cameraType)
  if (camera.year) specs.push(camera.year.toString())
  const specsStr = specs.length > 0 ? ` (${specs.join(', ')})` : ''

  const title = `${name}${specsStr}`
  const description = `Photos shot with ${name}, uploaded by the AvoidXray community.`

  return {
    title,
    description,
    openGraph: {
      title: `${name} – AvoidXray`,
      description,
      type: 'website',
      url: `https://avoidxray.com/cameras/${id}`,
      ...(camera.imageUrl && camera.imageStatus === 'approved' && {
        images: [{ url: camera.imageUrl, alt: name }],
      }),
    },
    twitter: {
      card: 'summary_large_image',
      title: name,
      description,
    },
    alternates: {
      canonical: `https://avoidxray.com/cameras/${id}`,
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

export default async function CameraDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  const userId = (session?.user as { id?: string } | undefined)?.id

  const camera = await prisma.camera.findUnique({
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

  if (!camera) notFound()

  // Get user's likes
  const userLikes = userId ? await prisma.like.findMany({
    where: { userId, photoId: { in: camera.photos.map(p => p.id) } },
    select: { photoId: true }
  }) : []
  const likedIds = new Set(userLikes.map(l => l.photoId))

  // Shuffle photos and add liked status
  const shuffledPhotos = shuffleArray(camera.photos).map(p => ({
    ...p,
    liked: likedIds.has(p.id)
  }))

  // Only show approved images
  const displayImage = camera.imageStatus === 'approved' ? camera.imageUrl : null
  const displayDescription = camera.imageStatus === 'approved' ? camera.description : null

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex flex-col">
      <Header />

      <main className="flex-1 max-w-7xl mx-auto w-full py-8 md:py-16 px-4 md:px-6">
        <Link href="/cameras" className="text-neutral-500 hover:text-white text-sm mb-6 inline-block">
          &larr; All Cameras
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
                    alt={camera.name}
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
                      d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
                    />
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"
                    />
                  </svg>
                </div>
              )}
            </div>

            {/* Info */}
            <div className="flex-1 p-6 md:p-8 flex flex-col justify-between">
              <div>
                {camera.brand && (
                  <div className="text-[#D32F2F] text-xs font-medium uppercase tracking-widest mb-1">{camera.brand}</div>
                )}
                <h1 className="text-2xl md:text-3xl font-bold text-white mb-3 tracking-tight leading-tight">
                  {camera.name}
                </h1>

                {/* Specs row */}
                <div className="flex flex-wrap items-center gap-2 mb-4">
                  {camera.cameraType && (
                    <span className="text-xs px-2 py-0.5 border border-neutral-700 text-neutral-300">{camera.cameraType}</span>
                  )}
                  {camera.format && (
                    <span className="text-xs px-2 py-0.5 border border-neutral-700 text-neutral-300">{camera.format}</span>
                  )}
                  {camera.mountType && (
                    <span className="text-xs px-2 py-0.5 border border-neutral-700 text-neutral-300">{camera.mountType}</span>
                  )}
                  {camera.year && (
                    <span className="text-xs px-2 py-0.5 border border-neutral-700 text-neutral-300">{camera.year}</span>
                  )}
                  <span className="text-xs text-neutral-500">{shuffledPhotos.length} photos</span>
                </div>

                {displayDescription ? (
                  <p className="text-neutral-400 text-sm leading-relaxed">{displayDescription}</p>
                ) : null}
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

        {/* Photos */}
        <div>
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-white">Photos Shot With This Camera</h2>
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
