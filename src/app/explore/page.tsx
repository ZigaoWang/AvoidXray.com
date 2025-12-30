import { prisma } from '@/lib/db'
import Image from 'next/image'
import Link from 'next/link'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

function daysSince(date: Date) {
  return Math.floor((Date.now() - new Date(date).getTime()) / (1000 * 60 * 60 * 24))
}

export default async function ExplorePage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab = 'trending' } = await searchParams
  const session = await getServerSession(authOptions)
  const userId = (session?.user as { id?: string } | undefined)?.id

  // Get following IDs if logged in
  const following = userId
    ? await prisma.follow.findMany({
        where: { followerId: userId },
        select: { followingId: true }
      })
    : []
  const followingIds = following.map(f => f.followingId)

  let photos = await prisma.photo.findMany({
    where: tab === 'following' && userId ? { userId: { in: followingIds } } : undefined,
    include: { user: true, filmStock: true, camera: true, _count: { select: { likes: true } } }
  })

  if (tab === 'trending') {
    photos = photos.map(p => ({
      ...p,
      score: p._count.likes + Math.max(0, 7 - daysSince(p.createdAt))
    })).sort((a, b) => (b as typeof b & { score: number }).score - (a as typeof a & { score: number }).score)
  } else if (tab === 'recent') {
    photos.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  } else if (tab === 'following') {
    photos.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  }

  const tabs = [
    { id: 'trending', label: 'Trending' },
    { id: 'recent', label: 'Recent' },
    ...(userId ? [{ id: 'following', label: 'Following' }] : [])
  ]

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex flex-col">
      <Header />

      <main className="flex-1">
        <div className="max-w-7xl mx-auto px-6 py-10">
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

          {/* Photos Masonry Grid */}
          {photos.length === 0 ? (
            <div className="text-center py-20 border border-dashed border-neutral-800">
              <p className="text-neutral-500 mb-4">
                {tab === 'following' ? "No photos from people you follow yet" : "No photos yet"}
              </p>
              {tab === 'following' && (
                <Link href="/explore?tab=trending" className="text-[#D32F2F] hover:underline">
                  Discover photographers to follow
                </Link>
              )}
            </div>
          ) : (
            <div className="columns-2 md:columns-3 lg:columns-4 gap-4 space-y-4">
              {photos.map(photo => (
                <Link key={photo.id} href={`/photos/${photo.id}`} className="block break-inside-avoid group">
                  <div className="relative bg-neutral-900 overflow-hidden">
                    <Image
                      src={photo.thumbnailPath}
                      alt={photo.caption || ''}
                      width={400}
                      height={Math.round(400 * (photo.height / photo.width))}
                      className="w-full group-hover:scale-105 transition-transform duration-300"
                      loading="lazy"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                      <div className="absolute bottom-3 left-3 right-3">
                        <p className="text-white text-sm font-medium truncate">@{photo.user.username}</p>
                        <p className="text-neutral-300 text-xs truncate">
                          {photo.filmStock?.name}{photo.filmStock && photo.camera && ' · '}{photo.camera?.name}
                        </p>
                      </div>
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
