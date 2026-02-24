import { prisma } from '@/lib/db'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import SuggestEditButton from '@/components/SuggestEditButton'
import MasonryGrid from '@/components/MasonryGrid'

// Force dynamic rendering so shuffle is different each request
export const dynamic = 'force-dynamic'

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

  const camera = await prisma.camera.findUnique({
    where: { id },
    include: {
      photos: { where: { published: true }, include: { filmStock: true, user: true } }
    }
  })

  if (!camera) notFound()

  // Shuffle photos for random display order
  const shuffledPhotos = shuffleArray(camera.photos)

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
            <div className="w-full md:w-2/5 lg:w-1/3 bg-neutral-900/50 flex items-center justify-center p-8 md:p-12">
              {displayImage ? (
                <div className="relative w-full aspect-[4/3]">
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
            <div className="flex-1 p-6 md:p-8 lg:p-12 flex flex-col justify-between">
              <div>
                {camera.brand && (
                  <div className="text-[#D32F2F] text-sm font-bold uppercase tracking-wider mb-2">
                    {camera.brand}
                  </div>
                )}
                <h1 className="text-3xl md:text-4xl lg:text-5xl font-black text-white mb-4 tracking-tight">
                  {camera.name}
                </h1>

                <div className="flex items-center gap-4 text-neutral-400 mb-6">
                  <div className="flex items-center gap-2">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <span className="text-lg font-semibold">{shuffledPhotos.length} photos</span>
                  </div>
                </div>

                {/* Camera Specs */}
                {(camera.cameraType || camera.format || camera.mountType || camera.year) && (
                  <div className="grid grid-cols-2 gap-3 mb-6 bg-neutral-900/50 p-4 border border-neutral-800">
                    {camera.cameraType && (
                      <div>
                        <div className="text-xs text-neutral-500 uppercase tracking-wider mb-1">Type</div>
                        <div className="text-white font-medium">{camera.cameraType}</div>
                      </div>
                    )}
                    {camera.format && (
                      <div>
                        <div className="text-xs text-neutral-500 uppercase tracking-wider mb-1">Format</div>
                        <div className="text-white font-medium">{camera.format}</div>
                      </div>
                    )}
                    {camera.mountType && (
                      <div>
                        <div className="text-xs text-neutral-500 uppercase tracking-wider mb-1">Mount</div>
                        <div className="text-white font-medium">{camera.mountType}</div>
                      </div>
                    )}
                    {camera.year && (
                      <div>
                        <div className="text-xs text-neutral-500 uppercase tracking-wider mb-1">Year</div>
                        <div className="text-white font-medium">{camera.year}</div>
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
                      Help the community by adding an image and description for this camera!
                    </p>
                  </div>
                )}
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

          <MasonryGrid photos={shuffledPhotos} showUser showFilm />
        </div>
      </main>

      <Footer />
    </div>
  )
}
