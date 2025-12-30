import { prisma } from '@/lib/db'
import Image from 'next/image'
import Link from 'next/link'
import Header from '@/components/Header'
import Footer from '@/components/Footer'

function daysSince(date: Date) {
  return Math.floor((Date.now() - new Date(date).getTime()) / (1000 * 60 * 60 * 24))
}

export default async function ExplorePage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab = 'trending' } = await searchParams

  const photos = await prisma.photo.findMany({
    include: { user: true, filmStock: true, camera: true, _count: { select: { likes: true } } }
  })

  let sortedPhotos = [...photos]

  if (tab === 'trending') {
    sortedPhotos = photos.map(p => ({
      ...p,
      score: p._count.likes + Math.max(0, 7 - daysSince(p.createdAt))
    })).sort((a, b) => b.score - a.score)
  } else if (tab === 'recent') {
    sortedPhotos.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  } else if (tab === 'random') {
    sortedPhotos.sort(() => Math.random() - 0.5)
  }

  const tabs = [
    { id: 'trending', label: 'Trending' },
    { id: 'recent', label: 'Recent' },
    { id: 'random', label: 'Random' }
  ]

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex flex-col">
      <Header />

      <main className="flex-1">
        <div className="max-w-6xl mx-auto px-6 py-10">
          <h1 className="text-3xl font-black text-white mb-2 tracking-tight">Explore</h1>
          <p className="text-neutral-500 mb-8">Discover film photography</p>

          {/* Tabs */}
          <div className="flex gap-4 border-b border-neutral-800 mb-8">
            {tabs.map(t => (
              <Link
                key={t.id}
                href={`/explore?tab=${t.id}`}
                className={`py-3 text-sm font-medium transition-colors ${tab === t.id ? 'text-white border-b-2 border-[#D32F2F]' : 'text-neutral-500 hover:text-white'}`}
              >
                {t.label}
              </Link>
            ))}
          </div>

          {/* Photos Grid */}
          {sortedPhotos.length === 0 ? (
            <div className="text-center py-20 border border-dashed border-neutral-800">
              <p className="text-neutral-500">No photos yet</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-1">
              {sortedPhotos.map(photo => (
                <Link key={photo.id} href={`/photos/${photo.id}`} className="relative aspect-square bg-neutral-900 group overflow-hidden">
                  <Image
                    src={photo.thumbnailPath}
                    alt={photo.caption || ''}
                    fill
                    className="object-cover group-hover:opacity-80 transition-opacity"
                    sizes="25vw"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                    <div className="absolute bottom-2 left-2 right-2">
                      <p className="text-white text-sm font-medium truncate">@{photo.user.username}</p>
                      {photo.filmStock && <p className="text-neutral-300 text-xs truncate">{photo.filmStock.name}</p>}
                    </div>
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
