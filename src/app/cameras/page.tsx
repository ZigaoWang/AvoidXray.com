import { prisma } from '@/lib/db'
import Link from 'next/link'
import Image from 'next/image'
import Header from '@/components/Header'
import Footer from '@/components/Footer'

export default async function CamerasPage() {
  const cameras = await prisma.camera.findMany({
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
        <h1 className="text-4xl font-black text-white mb-2 tracking-tight">Cameras</h1>
        <p className="text-neutral-500 mb-12">Explore photos by camera</p>

        {cameras.length === 0 ? (
          <div className="text-center py-24 border border-dashed border-neutral-800">
            <p className="text-neutral-500">No cameras yet</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {cameras.map(camera => {
              const displayImage = camera.imageStatus === 'approved' ? camera.imageUrl : null
              return (
                <Link
                  key={camera.id}
                  href={`/cameras/${camera.id}`}
                  className="group bg-neutral-900 border border-neutral-800 hover:border-[#D32F2F] transition-colors overflow-hidden"
                >
                  {/* Photo Grid */}
                  <div className="grid grid-cols-4 gap-px bg-neutral-800">
                    {camera.photos.slice(0, 4).map(photo => (
                      <div key={photo.id} className="aspect-square relative bg-neutral-900">
                        <Image src={photo.thumbnailPath} alt="" fill className="object-cover" sizes="100px" />
                      </div>
                    ))}
                    {Array.from({ length: Math.max(0, 4 - camera.photos.length) }).map((_, i) => (
                      <div key={i} className="aspect-square bg-neutral-900" />
                    ))}
                  </div>

                  {/* Info Section with Camera Image */}
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
                              d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
                            />
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"
                            />
                          </svg>
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-white font-bold group-hover:text-[#D32F2F] transition-colors truncate">
                        {camera.brand ? `${camera.brand} ${camera.name}` : camera.name}
                      </h3>
                      <p className="text-neutral-500 text-sm">{camera._count.photos} photos</p>
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
