import { prisma } from '@/lib/db'
import { Prisma } from '@prisma/client'
import Link from 'next/link'
import Image from 'next/image'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import type { Metadata } from 'next'
import { blurHashToDataURL } from '@/lib/blurhash'

export const metadata: Metadata = {
  title: 'Film Stocks',
  description: 'Photos organized by film stock, uploaded by the AvoidXray community.',
  openGraph: {
    title: 'Film Stocks – AvoidXray',
    description: 'Photos organized by film stock, uploaded by the AvoidXray community.',
    url: 'https://avoidxray.com/films',
  },
  alternates: {
    canonical: 'https://avoidxray.com/films',
  },
}

export const dynamic = 'force-dynamic'

export default async function FilmsPage() {
  const filmStocks = await prisma.filmStock.findMany({
    include: {
      _count: { select: { photos: { where: { published: true } } } }
    },
    orderBy: { name: 'asc' }
  })

  // Get 4 random photos for each film stock using raw SQL
  const filmStockIds = filmStocks.map(f => f.id)
  const randomPhotos = filmStockIds.length > 0 ? await prisma.$queryRaw<{ id: string; thumbnailPath: string; filmStockId: string; blurHash: string | null }[]>`
    SELECT id, "thumbnailPath", "filmStockId", "blurHash" FROM (
      SELECT id, "thumbnailPath", "filmStockId", "blurHash", ROW_NUMBER() OVER (PARTITION BY "filmStockId" ORDER BY RANDOM()) as rn
      FROM "Photo"
      WHERE "filmStockId" IN (${Prisma.join(filmStockIds)}) AND published = true
    ) p WHERE rn <= 4
  ` : []

  // Group photos by film stock
  const photosByFilm = new Map<string, typeof randomPhotos>()
  for (const photo of randomPhotos) {
    if (!photosByFilm.has(photo.filmStockId)) {
      photosByFilm.set(photo.filmStockId, [])
    }
    photosByFilm.get(photo.filmStockId)!.push(photo)
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex flex-col">
      <Header />

      <main className="flex-1 max-w-7xl mx-auto w-full py-16 px-6">
        <h1 className="text-4xl font-black text-white mb-2 tracking-tight">Film Stocks</h1>
        <p className="text-neutral-500 mb-12">Explore photos by film</p>

        {filmStocks.length === 0 ? (
          <div className="text-center py-24 border border-dashed border-neutral-800">
            <p className="text-neutral-500">No film stocks yet</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filmStocks.map(film => {
              const displayImage = film.imageStatus === 'approved' ? film.imageUrl : null
              const photos = photosByFilm.get(film.id) || []
              return (
                <Link
                  key={film.id}
                  href={`/films/${film.id}`}
                  className="group bg-neutral-900 border border-neutral-800 hover:border-[#D32F2F] transition-colors overflow-hidden"
                >
                  {/* Photo Grid */}
                  <div className="grid grid-cols-4 gap-px bg-neutral-800">
                    {photos.slice(0, 4).map(photo => (
                      <div key={photo.id} className="aspect-square relative bg-neutral-900">
                        <Image
                          src={photo.thumbnailPath}
                          alt=""
                          fill
                          className="object-cover"
                          sizes="100px"
                          placeholder={photo.blurHash ? 'blur' : 'empty'}
                          blurDataURL={blurHashToDataURL(photo.blurHash)}
                        />
                      </div>
                    ))}
                    {Array.from({ length: Math.max(0, 4 - photos.length) }).map((_, i) => (
                      <div key={i} className="aspect-square bg-neutral-900" />
                    ))}
                  </div>

                  {/* Info Section with Film Image */}
                  <div className="p-4 flex items-center gap-4">
                    {/* Always reserve space for image */}
                    <div className="relative w-32 h-24 flex-shrink-0">
                      {displayImage ? (
                        <Image
                          src={displayImage}
                          alt=""
                          fill
                          className="object-contain"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-neutral-800 rounded">
                          <svg
                            className="w-12 h-12 text-neutral-600"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01"
                            />
                          </svg>
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-lg font-bold group-hover:text-[#D32F2F] transition-colors truncate">
                        {film.brand ? `${film.brand} ${film.name}` : film.name}
                      </h3>
                      <div className="flex items-center gap-2 text-neutral-500">
                        {film.iso && <span>ISO {film.iso}</span>}
                        {film.iso && <span>•</span>}
                        <span>{film._count.photos} photos</span>
                      </div>
                    </div>
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </main>

      <Footer />
    </div>
  )
}
