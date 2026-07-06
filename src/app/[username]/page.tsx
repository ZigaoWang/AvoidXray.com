import { prisma } from '@/lib/db'
import { notFound } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import FollowButton from '@/components/FollowButton'
import FollowersModal from '@/components/FollowersModal'
import ProfileTabs from '@/components/ProfileTabs'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import type { Metadata } from 'next'

export async function generateMetadata({ params }: { params: Promise<{ username: string }> }): Promise<Metadata> {
  const { username } = await params
  const user = await prisma.user.findUnique({
    where: { username },
    include: { _count: { select: { photos: { where: { published: true } } } } }
  })

  if (!user) return { title: 'User Not Found' }

  const displayName = user.name || user.username
  const photoCount = user._count.photos
  let description = user.bio ? user.bio.slice(0, 150) : `Film photographer on AvoidXray`
  if (photoCount > 0) description += ` · ${photoCount} photos`

  return {
    title: `${displayName} (@${user.username})`,
    description,
    openGraph: {
      title: `${displayName} – AvoidXray`,
      description,
      type: 'profile',
      url: `https://avoidxray.com/${username}`,
      ...(user.avatar && { images: [{ url: user.avatar, alt: displayName }] }),
    },
    twitter: {
      card: 'summary',
      title: `${displayName} (@${user.username})`,
      description,
      ...(user.avatar && { images: [user.avatar] }),
    },
    alternates: { canonical: `https://avoidxray.com/${username}` },
  }
}

export default async function UserPage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params
  const session = await getServerSession(authOptions)
  const currentUserId = session?.user ? (session.user as { id: string }).id : null

  const user = await prisma.user.findUnique({
    where: { username },
    include: {
      photos: {
        where: { published: true },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          thumbnailPath: true,
          width: true,
          height: true,
          blurHash: true,
          cameraId: true,
          filmStockId: true,
          createdAt: true,
          _count: { select: { likes: true } }
        }
      },
      _count: { select: { photos: { where: { published: true } }, followers: true, following: true } }
    }
  })

  if (!user) notFound()

  const isOwn = currentUserId === user.id

  const [isFollowingRecord, userLikes, cameraUsage, filmUsage] = await Promise.all([
    currentUserId && !isOwn
      ? prisma.follow.findUnique({
          where: { followerId_followingId: { followerId: currentUserId, followingId: user.id } }
        })
      : Promise.resolve(null),
    currentUserId
      ? prisma.like.findMany({
          where: { userId: currentUserId, photoId: { in: user.photos.map(p => p.id) } },
          select: { photoId: true }
        })
      : Promise.resolve([]),
    prisma.photo.groupBy({
      by: ['cameraId'],
      where: { userId: user.id, published: true, cameraId: { not: null } },
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } }
    }),
    prisma.photo.groupBy({
      by: ['filmStockId'],
      where: { userId: user.id, published: true, filmStockId: { not: null } },
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } }
    }),
  ])

  const cameraIds = cameraUsage.map(c => c.cameraId!).filter(Boolean)
  const filmIds = filmUsage.map(f => f.filmStockId!).filter(Boolean)

  const [cameras, films] = await Promise.all([
    cameraIds.length > 0
      ? prisma.camera.findMany({
          where: { id: { in: cameraIds } },
          select: { id: true, name: true, brand: true, imageUrl: true, imageStatus: true, cameraType: true }
        })
      : Promise.resolve([]),
    filmIds.length > 0
      ? prisma.filmStock.findMany({
          where: { id: { in: filmIds } },
          select: { id: true, name: true, brand: true, imageUrl: true, imageStatus: true, iso: true }
        })
      : Promise.resolve([]),
  ])

  // Group user photos by cameraId / filmStockId for gear cards
  const photosByCameraId = new Map<string, typeof user.photos>()
  const photosByFilmId = new Map<string, typeof user.photos>()
  for (const p of user.photos) {
    if (p.cameraId) {
      if (!photosByCameraId.has(p.cameraId)) photosByCameraId.set(p.cameraId, [])
      const arr = photosByCameraId.get(p.cameraId)!
      if (arr.length < 4) arr.push(p)
    }
    if (p.filmStockId) {
      if (!photosByFilmId.has(p.filmStockId)) photosByFilmId.set(p.filmStockId, [])
      const arr = photosByFilmId.get(p.filmStockId)!
      if (arr.length < 4) arr.push(p)
    }
  }

  const cameraMap = Object.fromEntries(cameras.map(c => [c.id, c]))
  const filmMap = Object.fromEntries(films.map(f => [f.id, f]))

  const cameraStats = cameraUsage.map(c => ({
    id: c.cameraId!,
    name: cameraMap[c.cameraId!]?.name ?? 'Unknown',
    brand: cameraMap[c.cameraId!]?.brand ?? null,
    count: c._count.id,
    imageUrl: cameraMap[c.cameraId!]?.imageUrl ?? null,
    imageStatus: cameraMap[c.cameraId!]?.imageStatus ?? 'none',
    cameraType: cameraMap[c.cameraId!]?.cameraType ?? null,
    photos: (photosByCameraId.get(c.cameraId!) ?? []).map(p => ({
      id: p.id,
      thumbnailPath: p.thumbnailPath,
      blurHash: p.blurHash ?? null,
    }))
  }))

  const filmStats = filmUsage.map(f => ({
    id: f.filmStockId!,
    name: filmMap[f.filmStockId!]?.name ?? 'Unknown',
    brand: filmMap[f.filmStockId!]?.brand ?? null,
    count: f._count.id,
    imageUrl: filmMap[f.filmStockId!]?.imageUrl ?? null,
    imageStatus: filmMap[f.filmStockId!]?.imageStatus ?? 'none',
    iso: filmMap[f.filmStockId!]?.iso ?? null,
    photos: (photosByFilmId.get(f.filmStockId!) ?? []).map(p => ({
      id: p.id,
      thumbnailPath: p.thumbnailPath,
      blurHash: p.blurHash ?? null,
    }))
  }))

  const likedIds = new Set((userLikes as { photoId: string }[]).map(l => l.photoId))
  const photosWithLiked = user.photos.map(p => ({
    ...p,
    liked: likedIds.has(p.id),
    createdAt: p.createdAt.toISOString(),
  }))

  const totalLikes = user.photos.reduce((sum, p) => sum + p._count.likes, 0)
  const joinDate = user.createdAt.toLocaleDateString('en-US', { year: 'numeric', month: 'long' })

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex flex-col">
      <Header />

      <main className="flex-1">
        {/* Profile Header */}
        <div className="border-b border-neutral-900">
          <div className="max-w-7xl mx-auto px-6 py-12">
            <div className="flex flex-col sm:flex-row sm:items-start gap-8">
              {/* Avatar */}
              <div className="w-28 h-28 sm:w-36 sm:h-36 bg-neutral-800 flex items-center justify-center text-white text-4xl font-black shrink-0 overflow-hidden">
                {user.avatar ? (
                  <Image src={user.avatar} alt="" width={144} height={144} className="w-full h-full object-cover" />
                ) : (
                  (user.name || user.username).charAt(0).toUpperCase()
                )}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0 space-y-4">
                {/* Name + handle + action */}
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
                      {user.name || user.username}
                    </h1>
                    <p className="text-neutral-500 text-sm mt-0.5">@{user.username}</p>
                  </div>
                  {!isOwn && <FollowButton username={username} initialFollowing={!!isFollowingRecord} />}
                  {isOwn && (
                    <Link
                      href="/settings"
                      className="shrink-0 bg-neutral-800 hover:bg-neutral-700 text-white px-4 py-2 text-sm font-medium flex items-center gap-2 transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                      Edit profile
                    </Link>
                  )}
                </div>

                {/* Bio */}
                {user.bio && (
                  <p className="text-neutral-300 text-sm leading-relaxed max-w-lg">{user.bio}</p>
                )}

                {/* Social Links */}
                {(user.website || user.instagram || user.twitter) && (
                  <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
                    {user.website && (
                      <a href={user.website} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-xs text-neutral-500 hover:text-white transition-colors">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                        </svg>
                        {user.website.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')}
                      </a>
                    )}
                    {user.instagram && (
                      <a href={`https://instagram.com/${user.instagram}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-xs text-neutral-500 hover:text-white transition-colors">
                        <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
                        </svg>
                        @{user.instagram}
                      </a>
                    )}
                    {user.twitter && (
                      <a href={`https://twitter.com/${user.twitter}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-xs text-neutral-500 hover:text-white transition-colors">
                        <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.73-8.835L1.254 2.25H8.08l4.253 5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                        </svg>
                        @{user.twitter}
                      </a>
                    )}
                  </div>
                )}

                {/* Stats */}
                <div className="flex flex-wrap items-center gap-x-6 gap-y-2 pt-1">
                  <div>
                    <span className="text-white font-bold">{user._count.photos}</span>
                    <span className="text-neutral-500 text-sm ml-1">{user._count.photos === 1 ? 'photo' : 'photos'}</span>
                  </div>
                  <FollowersModal username={username} type="followers" count={user._count.followers} />
                  <FollowersModal username={username} type="following" count={user._count.following} />
                  <div>
                    <span className="text-white font-bold">{totalLikes}</span>
                    <span className="text-neutral-500 text-sm ml-1">{totalLikes === 1 ? 'like' : 'likes'}</span>
                  </div>
                </div>

                <p className="text-neutral-700 text-xs">Joined {joinDate}</p>
              </div>
            </div>
          </div>
        </div>

        <ProfileTabs
          photos={photosWithLiked}
          cameraStats={cameraStats}
          filmStats={filmStats}
          totalLikes={totalLikes}
        />
      </main>

      <Footer />
    </div>
  )
}
