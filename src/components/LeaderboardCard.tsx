import Link from 'next/link'
import Image from 'next/image'

interface LeaderboardUser {
  username: string
  name: string | null
  avatar: string | null
  photoCount: number
  followerCount: number
  totalLikes: number
}

export default function LeaderboardCard({ users }: { users: LeaderboardUser[] }) {
  if (users.length === 0) return null

  return (
    <div className="bg-neutral-900 p-4">
      <h3 className="text-sm font-bold uppercase tracking-wide text-neutral-400 mb-4">Top Photographers</h3>
      <div className="space-y-3">
        {users.map((user, index) => (
          <Link
            key={user.username}
            href={`/${user.username}`}
            className="flex items-center gap-3 hover:bg-neutral-800 p-2 -mx-2 transition-colors"
          >
            <span className="text-neutral-600 text-sm font-bold w-5">{index + 1}</span>
            <div className="w-10 h-10 bg-neutral-800 flex items-center justify-center text-white text-sm font-bold overflow-hidden flex-shrink-0">
              {user.avatar ? (
                <Image src={user.avatar} alt={`${user.name || user.username} avatar`} width={40} height={40} className="w-full h-full object-cover" />
              ) : (
                (user.name || user.username).charAt(0).toUpperCase()
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white text-sm font-medium truncate">{user.name || user.username}</p>
              <p className="text-neutral-500 text-xs">
                {user.totalLikes} likes · {user.photoCount} photos
              </p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
