import { prisma } from '@/lib/db'
import { Prisma } from '@prisma/client'
import Link from 'next/link'
import Image from 'next/image'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import AddCameraButton from '@/components/AddCameraButton'
import type { Metadata } from 'next'
import { blurHashToDataURL } from '@/lib/blurhash'

export const metadata: Metadata = {
  title: 'Cameras',
  description: 'Photos organized by camera, uploaded by the AvoidXray community.',
  openGraph: {
    title: 'Cameras – AvoidXray',
    description: 'Photos organized by camera, uploaded by the AvoidXray community.',
    url: 'https://avoidxray.com/cameras',
  },
  alternates: {
    canonical: 'https://avoidxray.com/cameras',
  },
}

export const dynamic = 'force-dynamic'

export default async function CamerasPage() {
  const cameras = await prisma.camera.findMany({
    include: {
      _count: { select: { photos: { where: { published: true } } } }
    },
    orderBy: { name: 'asc' }
  })

  // Get 4 random photos for each camera using raw SQL
  const cameraIds = cameras.map(c => c.id)
  const randomPhotos = cameraIds.length > 0 ? await prisma.$queryRaw<{ id: string; thumbnailPath: string; cameraId: string; blurHash: string | null }[]>`
    SELECT id, "thumbnailPath", "cameraId", "blurHash" FROM (
      SELECT id, "thumbnailPath", "cameraId", "blurHash", ROW_NUMBER() OVER (PARTITION BY "cameraId" ORDER BY RANDOM()) as rn
      FROM "Photo"
      WHERE "cameraId" IN (${Prisma.join(cameraIds)}) AND published = true
    ) p WHERE rn <= 4
  ` : []

  // Group photos by camera
  const photosByCamera = new Map<string, typeof randomPhotos>()
  for (const photo of randomPhotos) {
    if (!photosByCamera.has(photo.cameraId)) {
      photosByCamera.set(photo.cameraId, [])
    }
    photosByCamera.get(photo.cameraId)!.push(photo)
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex flex-col">
      <Header />

      <main className="flex-1 max-w-7xl mx-auto w-full py-16 px-6">
        <div className="flex items-center justify-between mb-12">
          <div>
            <h1 className="text-4xl font-black text-white mb-2 tracking-tight">Cameras</h1>
            <p className="text-neutral-500">Explore photos by camera</p>
          </div>
          <AddCameraButton />
        </div>

        {cameras.length === 0 ? (
          <div className="text-center py-24 border border-dashed border-neutral-800">
            <p className="text-neutral-500">No cameras yet</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {cameras.map(camera => {
              const displayImage = camera.imageStatus === 'approved' ? camera.imageUrl : null
              const photos = photosByCamera.get(camera.id) || []
              return (
                <Link
                  key={camera.id}
                  href={`/cameras/${camera.id}`}
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
                      <h3 className="text-lg font-bold group-hover:text-[#D32F2F] transition-colors truncate">
                        {camera.brand ? `${camera.brand} ${camera.name}` : camera.name}
                      </h3>
                      <p className="text-neutral-500">{camera._count.photos} photos</p>
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
