import { prisma } from '@/lib/db'
import Link from 'next/link'
import Image from 'next/image'
import Header from '@/components/Header'
import Footer from '@/components/Footer'

export default async function FilmsPage() {
  const filmStocks = await prisma.filmStock.findMany({
    include: {
      photos: { take: 4, orderBy: { createdAt: 'desc' } },
      _count: { select: { photos: true } }
    },
    orderBy: { name: 'asc' }
  })

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
              return (
                <Link
                  key={film.id}
                  href={`/films/${film.id}`}
                  className="group bg-neutral-900 border border-neutral-800 hover:border-[#D32F2F] transition-colors overflow-hidden"
                >
                  {/* Photo Grid */}
                  <div className="grid grid-cols-4 gap-px bg-neutral-800">
                    {film.photos.slice(0, 4).map(photo => (
                      <div key={photo.id} className="aspect-square relative bg-neutral-900">
                        <Image src={photo.thumbnailPath} alt="" fill className="object-cover" sizes="100px" />
                      </div>
                    ))}
                    {Array.from({ length: Math.max(0, 4 - film.photos.length) }).map((_, i) => (
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
                      <h3 className="text-white font-bold group-hover:text-[#D32F2F] transition-colors truncate">
                        {film.brand ? `${film.brand} ${film.name}` : film.name}
                      </h3>
                      <div className="flex items-center gap-2 text-neutral-500 text-sm">
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
