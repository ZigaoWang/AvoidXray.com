import { prisma } from '@/lib/db'
import { notFound } from 'next/navigation'
import Image from 'next/image'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import FollowButton from '@/components/FollowButton'
import FollowersModal from '@/components/FollowersModal'
import MasonryGrid from '@/components/MasonryGrid'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import type { Metadata } from 'next'

export async function generateMetadata({ params }: { params: Promise<{ username: string }> }): Promise<Metadata> {
  const { username } = await params
  const user = await prisma.user.findUnique({
    where: { username },
    include: { _count: { select: { photos: { where: { published: true } } } } }
  })

  if (!user) {
    return { title: 'User Not Found' }
  }

  const displayName = user.name || user.username
  const title = `${displayName} (@${user.username})`
  const photoCount = user._count.photos

  let description = user.bio ? user.bio.slice(0, 150) : `Film photographer on AvoidXray`
  if (photoCount > 0) {
    description += ` · ${photoCount} photos`
  }

  return {
    title,
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
    alternates: {
      canonical: `https://avoidxray.com/${username}`,
    },
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
          _count: { select: { likes: true } }
        }
      },
      _count: { select: { photos: { where: { published: true } }, followers: true, following: true } }
    }
  })

  if (!user) notFound()

  const isFollowing = currentUserId ? await prisma.follow.findUnique({
    where: { followerId_followingId: { followerId: currentUserId, followingId: user.id } }
  }) : null

  // Get user's likes
  const userLikes = currentUserId ? await prisma.like.findMany({
    where: { userId: currentUserId, photoId: { in: user.photos.map(p => p.id) } },
    select: { photoId: true }
  }) : []
  const likedIds = new Set(userLikes.map(l => l.photoId))

  const photosWithLiked = user.photos.map(p => ({
    ...p,
    liked: likedIds.has(p.id)
  }))

  const totalLikes = user.photos.reduce((sum, p) => sum + p._count.likes, 0)
  const joinDate = user.createdAt.toLocaleDateString('en-US', { year: 'numeric', month: 'long' })

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex flex-col">
      <Header />

      <main className="flex-1">
        {/* Profile Header */}
        <div className="border-b border-neutral-900">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
            <div className="flex flex-col sm:flex-row sm:items-start gap-6 sm:gap-8">
              {/* Avatar */}
              <div className="w-28 h-28 sm:w-36 sm:h-36 bg-neutral-800 flex items-center justify-center text-white text-4xl sm:text-5xl font-black shrink-0 overflow-hidden">
                {user.avatar ? (
                  <Image src={user.avatar} alt="" width={144} height={144} className="w-full h-full object-cover" />
                ) : (
                  (user.name || user.username).charAt(0).toUpperCase()
                )}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0 space-y-4">
                {/* Name + handle + follow */}
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                  <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">{user.name || user.username}</h1>
                  <span className="text-neutral-500 text-base">@{user.username}</span>
                  <div className="ml-auto sm:ml-0">
                    <FollowButton username={username} initialFollowing={!!isFollowing} />
                  </div>
                </div>

                {/* Bio */}
                {user.bio && <p className="text-neutral-300 text-sm leading-relaxed">{user.bio}</p>}

                {/* Social Links */}
                {(user.website || user.instagram || user.twitter) && (
                  <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
                    {user.website && (
                      <a href={user.website} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-xs text-neutral-500 hover:text-white transition-colors">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" /></svg>
                        {user.website.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')}
                      </a>
                    )}
                    {user.instagram && (
                      <a href={`https://instagram.com/${user.instagram}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-xs text-neutral-500 hover:text-white transition-colors">
                        <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/></svg>
                        @{user.instagram}
                      </a>
                    )}
                    {user.twitter && (
                      <a href={`https://twitter.com/${user.twitter}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-xs text-neutral-500 hover:text-white transition-colors">
                        <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.73-8.835L1.254 2.25H8.08l4.253 5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
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

        {/* Photos */}
        <div className="max-w-5xl mx-auto px-6 py-10">
          <MasonryGrid photos={photosWithLiked} />
        </div>
      </main>

      <Footer />
    </div>
  )
}
