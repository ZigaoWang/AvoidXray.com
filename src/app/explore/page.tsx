import { prisma } from '@/lib/db'
import Link from 'next/link'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import PhotoGrid from '@/components/PhotoGrid'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

function daysSince(date: Date) {
  return Math.floor((Date.now() - new Date(date).getTime()) / (1000 * 60 * 60 * 24))
}

export default async function ExplorePage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab = 'trending' } = await searchParams
  const session = await getServerSession(authOptions)
  const userId = (session?.user as { id?: string } | undefined)?.id

  const following = userId
    ? await prisma.follow.findMany({
        where: { followerId: userId },
        select: { followingId: true }
      })
    : []
  const followingIds = following.map(f => f.followingId)

  let photos = await prisma.photo.findMany({
    where: tab === 'following' && userId ? { userId: { in: followingIds } } : undefined,
    include: { user: true, filmStock: true, camera: true, _count: { select: { likes: true } } },
    take: 21
  })

  const userLikes = userId ? await prisma.like.findMany({
    where: { userId, photoId: { in: photos.map(p => p.id) } },
    select: { photoId: true }
  }) : []
  const likedIds = new Set(userLikes.map(l => l.photoId))

  if (tab === 'trending') {
    photos = photos.map(p => ({
      ...p,
      score: p._count.likes + Math.max(0, 7 - daysSince(p.createdAt))
    })).sort((a, b) => (b as typeof b & { score: number }).score - (a as typeof a & { score: number }).score)
  } else {
    photos.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  }

  const hasMore = photos.length > 20
  const initialPhotos = (hasMore ? photos.slice(0, 20) : photos).map(p => ({ ...p, liked: likedIds.has(p.id) }))
  const nextOffset = hasMore ? 20 : null

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

          <PhotoGrid initialPhotos={initialPhotos} initialOffset={nextOffset} tab={tab} />
        </div>
      </main>

      <Footer />
    </div>
  )
}
