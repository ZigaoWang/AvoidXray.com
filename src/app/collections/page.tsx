import { prisma } from '@/lib/db'
import Image from 'next/image'
import Link from 'next/link'
import Header from '@/components/Header'
import Footer from '@/components/Footer'

export default async function CollectionsPage() {
  const collections = await prisma.collection.findMany({
    where: { featured: true },
    include: {
      photos: {
        include: { photo: true },
        orderBy: { order: 'asc' },
        take: 4
      },
      _count: { select: { photos: true } }
    },
    orderBy: { createdAt: 'desc' }
  })

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex flex-col">
      <Header />

      <main className="flex-1">
        <div className="max-w-6xl mx-auto px-6 py-10">
          <h1 className="text-3xl font-black text-white mb-2 tracking-tight">Featured Collections</h1>
          <p className="text-neutral-500 mb-8">Curated photo collections</p>

          {collections.length === 0 ? (
            <div className="text-center py-20 border border-dashed border-neutral-800">
              <p className="text-neutral-500">No collections yet</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {collections.map(collection => (
                <Link
                  key={collection.id}
                  href={`/collections/${collection.id}`}
                  className="group bg-neutral-900 overflow-hidden hover:bg-neutral-800 transition-colors"
                >
                  <div className="grid grid-cols-4 gap-0.5">
                    {collection.photos.slice(0, 4).map((cp, i) => (
                      <div key={i} className="aspect-square relative">
                        <Image
                          src={cp.photo.thumbnailPath}
                          alt=""
                          fill
                          className="object-cover"
                          sizes="12vw"
                        />
                      </div>
                    ))}
                    {Array.from({ length: Math.max(0, 4 - collection.photos.length) }).map((_, i) => (
                      <div key={`empty-${i}`} className="aspect-square bg-neutral-800" />
                    ))}
                  </div>
                  <div className="p-4">
                    <h2 className="text-white font-bold text-lg group-hover:text-[#D32F2F] transition-colors">
                      {collection.name}
                    </h2>
                    {collection.description && (
                      <p className="text-neutral-500 text-sm mt-1 line-clamp-2">{collection.description}</p>
                    )}
                    <p className="text-neutral-600 text-xs mt-2">{collection._count.photos} photos</p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </main>

      <Footer />
    </div>
  )
}
