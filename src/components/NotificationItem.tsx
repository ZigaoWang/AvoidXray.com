import Image from 'next/image'
import Link from 'next/link'
import { formatDate } from '@/lib/formatDate'
import { focusRingInset } from '@/components/ui/focus'
import Avatar from '@/components/ui/Avatar'
import type { NotificationType } from '@/lib/notifications'

export interface NotificationItemData {
  id: string
  type: NotificationType
  createdAt: string | Date
  actor: { username: string; name: string | null; avatar: string | null }
  photo: { id: string; thumbnailPath: string } | null
  commentId?: string | null
  /** The start of the comment, for a comment notification. */
  excerpt?: string | null
  /** How many more people did the same, folded into this row. */
  others?: number
}

const messages: Record<'like' | 'comment' | 'follow', string> = {
  like: 'liked your photo',
  comment: 'commented on your photo',
  follow: 'started following you',
}

/**
 * Notices from the site rather than from a person. Written to say what
 * happened and what happens next, without calling the photo anything: the
 * check is often wrong, and its mistakes should not read as accusations.
 */
const SITE_NOTICES: Partial<Record<NotificationType, string>> = {
  held: 'The automatic check flagged your photo for possible nudity. Only you can see it until an admin reviews it.',
  approved: 'An admin reviewed your photo and it is now public.',
  rejected: 'An admin reviewed your photo and it stays hidden for breaking the guidelines. Only you can see it.',
  deleted: 'An admin removed one of your photos for breaking the guidelines.',
}

/**
 * One notification, in the bell and on /notifications.
 *
 * One link per row, and nothing clickable inside it. The row goes to the thing
 * the notification is about, which is what someone opening a notification is
 * asking for: the photo, at the comment for a comment, or the follower's
 * profile.
 */
export default function NotificationItem({
  n,
  fresh,
  onNavigate,
}: {
  n: NotificationItemData
  /** Drawn as new: unread, or unread when the list was opened. */
  fresh: boolean
  onNavigate?: () => void
}) {
  const href = n.photo
    ? `/photos/${n.photo.id}${n.type === 'comment' ? (n.commentId ? `#comment-${n.commentId}` : '#comments') : ''}`
    : `/${n.actor.username}`
  const createdAt = typeof n.createdAt === 'string' ? n.createdAt : n.createdAt.toISOString()
  const notice = SITE_NOTICES[n.type]

  return (
    <Link
      href={href}
      onClick={onNavigate}
      className={`flex items-center gap-3 px-4 py-3 transition-colors hover:bg-neutral-800
                  focus-visible:bg-neutral-800 ${focusRingInset} ${fresh ? 'bg-neutral-800/50' : ''}`}
    >
      {notice ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src="/logo-mark.svg" alt="" aria-hidden className="h-9 w-9 flex-shrink-0" />
      ) : (
        <Avatar src={n.actor.avatar} name={n.actor.name || n.actor.username} size={36} />
      )}
      <div className="min-w-0 flex-1">
        {notice ? (
          <p className="text-sm text-white">{notice}</p>
        ) : (
          <p className="text-sm text-white">
            <span className="font-medium">{n.actor.name || n.actor.username}</span>
            {n.others ? (
              <span className="text-neutral-400">
                {' '}and {n.others.toLocaleString('en-US')} {n.others === 1 ? 'other' : 'others'}
              </span>
            ) : null}{' '}
            <span className="text-neutral-400">{messages[n.type as keyof typeof messages]}</span>
          </p>
        )}
        {n.excerpt && (
          <p className="mt-0.5 line-clamp-2 text-xs text-neutral-300">&ldquo;{n.excerpt}&rdquo;</p>
        )}
        <time dateTime={createdAt} className="text-xs text-neutral-500">
          {formatDate(createdAt)}
        </time>
        {fresh && <span className="ml-2 text-xs font-medium text-brand-light">New</span>}
      </div>
      {n.photo && (
        <div className="h-10 w-10 flex-shrink-0">
          <Image src={n.photo.thumbnailPath} alt="" aria-hidden width={40} height={40} className="h-full w-full object-cover" />
        </div>
      )}
    </Link>
  )
}
