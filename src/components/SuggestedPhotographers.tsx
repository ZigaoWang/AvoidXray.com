import Link from 'next/link'
import { prisma } from '@/lib/db'
import { PUBLIC_PHOTO } from '@/lib/photoVisibility'
import Avatar from './ui/Avatar'
import FollowButton from './FollowButton'
import { sectionHeadingClass } from './ui/PageHeader'

/**
 * Photographers to follow, for a Following feed with nothing in it.
 *
 * The empty feed used to link to the random tab, which has no follow controls,
 * so following someone meant opening a photo, then the profile, then pressing
 * Follow, once per person. These are the accounts with the most public photos
 * the viewer does not already follow, each with its own Follow button.
 */
export default async function SuggestedPhotographers({
  viewerId,
  exclude,
}: {
  viewerId: string
  /** Already followed, and blocked in either direction. */
  exclude: string[]
}) {
  const top = await prisma.photo.groupBy({
    by: ['userId'],
    where: { ...PUBLIC_PHOTO, userId: { notIn: [viewerId, ...exclude] } },
    _count: { _all: true },
    orderBy: { _count: { userId: 'desc' } },
    take: 6,
  })
  if (top.length === 0) return null

  const users = await prisma.user.findMany({
    where: { id: { in: top.flatMap(t => (t.userId ? [t.userId] : [])) } },
    select: { id: true, username: true, name: true, avatar: true },
  })
  const byId = new Map(users.map(u => [u.id, u]))

  return (
    <section className="mt-12">
      <h2 className={`${sectionHeadingClass} mb-4`}>Photographers to follow</h2>
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {top.map(({ userId, _count }) => {
          const user = userId ? byId.get(userId) : undefined
          if (!user) return null
          return (
            <li key={userId} className="flex items-center gap-3 border border-neutral-800 bg-neutral-900 p-3">
              <Link href={`/${user.username}`} className="flex min-w-0 flex-1 items-center gap-3 group">
                <Avatar src={user.avatar} name={user.name || user.username} size={40} />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-white group-hover:text-brand transition-colors">
                    {user.name || user.username}
                  </span>
                  <span className="block truncate text-xs text-neutral-500">
                    {_count._all.toLocaleString('en-US')} {_count._all === 1 ? 'photo' : 'photos'}
                  </span>
                </span>
              </Link>
              <FollowButton username={user.username} initialFollowing={false} />
            </li>
          )
        })}
      </ul>
    </section>
  )
}
