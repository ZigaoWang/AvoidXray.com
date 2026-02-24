import { prisma } from '@/lib/db'
import { notFound } from 'next/navigation'
import Image from 'next/image'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import FollowButton from '@/components/FollowButton'
import MasonryGrid from '@/components/MasonryGrid'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

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
        include: { _count: { select: { likes: true } } }
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
          <div className="max-w-5xl mx-auto px-6 py-12">
            <div className="flex items-center gap-8">
              {/* Avatar */}
              <div className="w-24 h-24 md:w-32 md:h-32 bg-neutral-800 flex items-center justify-center text-white text-4xl md:text-5xl font-black shrink-0 overflow-hidden">
                {user.avatar ? (
                  <Image src={user.avatar} alt="" width={128} height={128} className="w-full h-full object-cover" />
                ) : (
                  (user.name || user.username).charAt(0).toUpperCase()
                )}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-4 mb-2">
                  <h1 className="text-2xl md:text-3xl font-black text-white tracking-tight truncate">
                    {user.name || user.username}
                  </h1>
                  <FollowButton username={username} initialFollowing={!!isFollowing} />
                </div>
                <p className="text-neutral-500 text-sm mb-4">@{user.username}</p>

                {/* Bio */}
                {user.bio && (
                  <p className="text-neutral-300 text-sm mb-4">{user.bio}</p>
                )}

                {/* Social Links */}
                {(user.website || user.instagram || user.twitter) && (
                  <div className="flex items-center gap-4 mb-4 text-sm">
                    {user.website && (
                      <a href={user.website} target="_blank" rel="noopener noreferrer" className="text-neutral-400 hover:text-white transition-colors">
                        Website
                      </a>
                    )}
                    {user.instagram && (
                      <a href={`https://instagram.com/${user.instagram}`} target="_blank" rel="noopener noreferrer" className="text-neutral-400 hover:text-white transition-colors">
                        @{user.instagram}
                      </a>
                    )}
                    {user.twitter && (
                      <a href={`https://twitter.com/${user.twitter}`} target="_blank" rel="noopener noreferrer" className="text-neutral-400 hover:text-white transition-colors">
                        @{user.twitter}
                      </a>
                    )}
                  </div>
                )}

                {/* Stats */}
                <div className="flex items-center gap-6">
                  <div>
                    <span className="text-white font-bold">{user._count.photos}</span>
                    <span className="text-neutral-500 text-sm ml-1">{user._count.photos === 1 ? 'photo' : 'photos'}</span>
                  </div>
                  <div>
                    <span className="text-white font-bold">{user._count.followers}</span>
                    <span className="text-neutral-500 text-sm ml-1">{user._count.followers === 1 ? 'follower' : 'followers'}</span>
                  </div>
                  <div>
                    <span className="text-white font-bold">{user._count.following}</span>
                    <span className="text-neutral-500 text-sm ml-1">following</span>
                  </div>
                  <div>
                    <span className="text-white font-bold">{totalLikes}</span>
                    <span className="text-neutral-500 text-sm ml-1">{totalLikes === 1 ? 'like' : 'likes'}</span>
                  </div>
                </div>

                <p className="text-neutral-600 text-xs mt-4">Joined {joinDate}</p>
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
