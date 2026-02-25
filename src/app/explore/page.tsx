import { prisma } from '@/lib/db'
import Link from 'next/link'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import PhotoGrid from '@/components/PhotoGrid'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Explore',
  description: 'Film photography uploaded by the AvoidXray community.',
  openGraph: {
    title: 'Explore – AvoidXray',
    description: 'Film photography uploaded by the AvoidXray community.',
    url: 'https://avoidxray.com/explore',
  },
  alternates: {
    canonical: 'https://avoidxray.com/explore',
  },
}

export const dynamic = 'force-dynamic'

export default async function ExplorePage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab = 'random' } = await searchParams
  const session = await getServerSession(authOptions)
  const userId = (session?.user as { id?: string } | undefined)?.id

  const following = userId
    ? await prisma.follow.findMany({
        where: { followerId: userId },
        select: { followingId: true }
      })
    : []
  const followingIds = following.map(f => f.followingId)

  // Build where clause
  const where = {
    published: true,
    ...(tab === 'following' && userId ? { userId: { in: followingIds } } : {})
  }

  // Random photos
  let photos
  if (tab === 'random') {
    // Use raw SQL with RANDOM() for true randomness each request
    photos = await prisma.$queryRaw`
      SELECT p.*,
             json_build_object('username', u.username) as user,
             COALESCE(json_build_object('name', f.name), 'null'::json) as "filmStock",
             COALESCE(json_build_object('name', c.name), 'null'::json) as camera,
             (SELECT COUNT(*)::int FROM "Like" WHERE "photoId" = p.id) as likes_count
      FROM "Photo" p
      LEFT JOIN "User" u ON p."userId" = u.id
      LEFT JOIN "FilmStock" f ON p."filmStockId" = f.id
      LEFT JOIN "Camera" c ON p."cameraId" = c.id
      WHERE p.published = true
      ORDER BY RANDOM()
      LIMIT 21
    ` as any[]

    // Transform to match expected format
    photos = photos.map(p => ({
      ...p,
      filmStock: p.filmStock === 'null' ? null : p.filmStock,
      camera: p.camera === 'null' ? null : p.camera,
      _count: { likes: p.likes_count }
    }))
  } else {
    // Regular ordering for other tabs
    photos = await prisma.photo.findMany({
      where,
      include: { user: true, filmStock: true, camera: true, _count: { select: { likes: true } } },
      orderBy: { createdAt: 'desc' },
      take: 21
    })
  }

  const userLikes = userId ? await prisma.like.findMany({
    where: { userId, photoId: { in: photos.map(p => p.id) } },
    select: { photoId: true }
  }) : []
  const likedIds = new Set(userLikes.map(l => l.photoId))

  const hasMore = photos.length > 20
  const initialPhotos = (hasMore ? photos.slice(0, 20) : photos).map(p => ({ ...p, liked: likedIds.has(p.id) }))
  const nextOffset = hasMore ? 20 : null

  const tabs = [
    { id: 'random', label: 'Random' },
    { id: 'recent', label: 'Recent' },
    { id: 'popular', label: 'Popular' },
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
