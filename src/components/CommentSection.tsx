'use client'

import { useState, useEffect, useRef } from 'react'
import { useSession } from 'next-auth/react'
import Image from 'next/image'
import Link from 'next/link'
import { useToast } from './ui/Toast'
import ItemActions from './ItemActions'
import ConfirmDialog from './ui/ConfirmDialog'
import { apiErrorMessage } from '@/lib/apiError'
import Button from '@/components/ui/Button'
import { fieldClass } from '@/components/ui/Field'
import { focusRing } from '@/components/ui/focus'
import { VALIDATION_LIMITS } from '@/lib/validation'
import { textLinkClass } from './ui/TextLink'
import { formatDate } from '@/lib/formatDate'

interface Comment {
  id: string
  content: string
  createdAt: string
  user: { username: string; name: string | null; avatar: string | null }
}

export default function CommentSection({ photoId }: { photoId: string }) {
  const { data: session } = useSession()
  const [comments, setComments] = useState<Comment[]>([])
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(false)
  /** The comment awaiting delete confirmation, if any. */
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'failed'>('loading')
  // Where the next page resumes from, and null once the thread has run out.
  const [cursor, setCursor] = useState<string | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)
  // The photo's whole comment count, which the heading names. It is no longer
  // the length of the list on screen now that the list arrives a page at a
  // time, so the server sends it with the first page and this tracks the
  // reader's own posts and deletions against it.
  const [total, setTotal] = useState(0)
  // Appending to the bottom of a list is silent to anyone not looking at it.
  const [announcement, setAnnouncement] = useState('')
  /**
   * Whether paging has reached the oldest comment.
   *
   * Set only by a press of Load more, because it is that press this answers:
   * the button unmounts with the last page, and the reader who pressed it was
   * standing on it, so focus fell to the document body with nothing between
   * them and the top of the page but a tab through the whole thread. The line
   * that replaces the button takes the focus instead.
   */
  const [atEnd, setAtEnd] = useState(false)
  const endRef = useRef<HTMLParagraphElement>(null)
  // Which photo the list on screen belongs to, readable after an await.
  // Moving from one photo page to the next updates this component in place
  // rather than remounting it, so `photoId` can change under a request that is
  // already in flight and the closure that started it still holds the old one.
  const thread = useRef(photoId)
  const { toast } = useToast()

  // The response was piped straight into setComments with no check at all, so
  // a 500 or a rate limit put `{ error: '…' }` into a variable the render
  // then calls .map on — taking the whole photo page down with it. It also
  // could not tell "no comments" from "the list never arrived", and showed the
  // empty state for both.
  useEffect(() => {
    let canceled = false
    thread.current = photoId
    setStatus('loading')
    // All four belong to the thread being left behind: a cursor held over
    // from it would page this photo from the wrong place, a count held over
    // would be this photo's heading stating another photo's total, the
    // announcement would describe a list that is no longer on screen, and the
    // end of that thread is not the end of this one.
    setCursor(null)
    setTotal(0)
    setAnnouncement('')
    setAtEnd(false)

    fetch(`/api/comments/${photoId}`)
      .then(res => (res.ok ? res.json() : Promise.reject(new Error())))
      .then(data => {
        if (canceled) return
        if (!Array.isArray(data?.comments)) throw new Error()
        setComments(data.comments)
        setCursor(data.nextCursor ?? null)
        setTotal(typeof data.total === 'number' ? data.total : data.comments.length)
        setStatus('ready')
      })
      .catch(() => { if (!canceled) setStatus('failed') })

    return () => { canceled = true }
  }, [photoId])

  // Older comments are asked for from the timestamp of the oldest one on
  // screen rather than by offset, so a comment posted while someone is reading
  // cannot push a row across the page boundary and have it arrive twice.
  const loadMore = async () => {
    if (!cursor || loadingMore) return
    const requested = photoId
    setLoadingMore(true)
    try {
      const res = await fetch(`/api/comments/${requested}?before=${encodeURIComponent(cursor)}`)
      if (!res.ok) throw new Error()
      const data = await res.json()
      // The same guard the first page has, for the same reason: a reader can
      // reach the next photo while this page is in flight. Appending it then
      // would file one photo's comments under another, and the cursor that
      // came with it would page the new thread from a position inside the old.
      if (thread.current !== requested) return
      if (!Array.isArray(data.comments)) throw new Error()
      const added: Comment[] = data.comments
      setComments(prev => [...prev, ...added])
      setCursor(data.nextCursor ?? null)
      if (!data.nextCursor) setAtEnd(true)
      // Carries the running position as well as the page size, for two
      // reasons: it tells a reader who cannot see the list grow where they now
      // are, and it makes each announcement different from the last, which a
      // live region needs in order to speak again.
      setAnnouncement(
        `${added.length} more comment${added.length === 1 ? '' : 's'} loaded, ` +
          `${comments.length + added.length} of ${total} shown`
      )
    } catch {
      // The button stays, so this is a retry rather than a dead end — but only
      // for the reader still on that thread. A failure belonging to a photo
      // left behind is not news on the one now showing.
      if (thread.current === requested) toast('Could not load more comments', 'error')
    } finally {
      setLoadingMore(false)
    }
  }

  // Only when the button taking itself away is what dropped focus: a reader
  // who moved on while the page was loading stays where they went.
  useEffect(() => {
    if (!atEnd) return
    const active = document.activeElement
    if (active && active !== document.body) return
    endRef.current?.focus()
  }, [atEnd])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!content.trim() || loading) return

    setLoading(true)
    try {
      const res = await fetch('/api/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ photoId, content })
      })

      if (res.ok) {
        const comment = await res.json()
        setComments(prev => [comment, ...prev])
        setTotal(prev => prev + 1)
        setContent('')
        toast('Comment added', 'success')
      } else {
        toast(await apiErrorMessage(res, 'Could not post that comment'), 'error')
      }
    } catch {
      // Left unhandled this rejected with loading still true, so the Post
      // button stayed disabled and the typed comment could not be sent again.
      toast('Could not reach the server. Your comment is still here.', 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/comments?id=${id}`, { method: 'DELETE' })
      if (res.ok) {
        setComments(prev => prev.filter(c => c.id !== id))
        setTotal(prev => Math.max(0, prev - 1))
        toast('Comment deleted', 'success')
      } else {
        // Silent failure left the comment on screen as though it had gone.
        toast(await apiErrorMessage(res, 'Could not delete that comment'), 'error')
      }
    } catch {
      toast('Could not reach the server', 'error')
    } finally {
      setDeletingId(null)
    }
  }

  const currentUserId = (session?.user as { username?: string })?.username

  return (
    <div className="space-y-4">
      {/* h2. On a photo page this sat under the h1 as an h3, and directly
          above "More like this" which is an h2, so the order went 1, 3, 2. */}
      <h2 className="text-sm font-bold uppercase tracking-wide text-neutral-400">
        {/* No count until there is one to give. It read "Comments (0)" while
            the list was still on its way, which is a statement about the
            photo, and it was wrong. */}
        Comments{status === 'ready' && ` (${total})`}
      </h2>

      {session ? (
        <form onSubmit={handleSubmit} className="flex gap-2">
          <label htmlFor={`comment-${photoId}`} className="sr-only">Add a comment</label>
          <input
            id={`comment-${photoId}`}
            type="text"
            value={content}
            onChange={e => setContent(e.target.value)}
            // The server refuses anything longer, and did so only after the
            // comment had been written and sent.
            maxLength={VALIDATION_LIMITS.MAX_COMMENT_LENGTH}
            placeholder="Add a comment…"
            // The shared field style. This input had its own border color and
            // padding, so the one place on a photo page you type sat a shade
            // off every other control on the site.
            className={`${fieldClass} flex-1`}
          />
          <Button type="submit" disabled={loading || !content.trim()} size="md">
            {loading ? 'Posting…' : 'Post'}
          </Button>
        </form>
      ) : (
        // Signed out, the form simply was not rendered and nothing explained
        // why, so the section read as though comments were closed.
        <p className="text-sm text-neutral-500">
          <Link href="/login" className={textLinkClass}>
            Sign in
          </Link>{' '}
          to leave a comment.
        </p>
      )}

      <div className="space-y-3">
        {status === 'loading' && <p className="text-sm text-neutral-600">Loading comments…</p>}
        {status === 'failed' && (
          <p className="text-sm text-neutral-500">Comments could not be loaded just now.</p>
        )}
        {comments.map(comment => (
          <div
            key={comment.id}
            id={`comment-${comment.id}`}
            className="flex gap-3 animate-fade-in scroll-mt-24"
          >
            <Link href={`/${comment.user.username}`} className="hover:opacity-80 transition-opacity flex-shrink-0">
              <div className="w-9 h-9 bg-neutral-800 flex items-center justify-center text-xs font-bold overflow-hidden flex-shrink-0">
                {comment.user.avatar ? (
                  <Image src={comment.user.avatar} alt={`${comment.user.name || comment.user.username} avatar`} width={32} height={32} className="w-full h-full object-cover" />
                ) : (
                  (comment.user.name || comment.user.username).charAt(0).toUpperCase()
                )}
              </div>
            </Link>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <Link href={`/${comment.user.username}`} className="text-sm font-medium text-white hover:underline">
                  {comment.user.name || comment.user.username}
                </Link>
                <span className="text-xs text-neutral-600">
                  {formatDate(comment.createdAt)}
                </span>
                {/* Your own comment offers Delete; someone else's offers
                    Report. Only one of the two is ever useful, so only one is
                    ever shown, and both sit in the same place either way. */}
                <span className="ml-auto -mr-2">
                  {currentUserId === comment.user.username ? (
                    <ItemActions
                      label="Your comment"
                      copyLink={`/photos/${photoId}#comment-${comment.id}`}
                      items={[
                        {
                          label: 'Delete',
                          destructive: true,
                          startsGroup: true,
                          // Asks first, the way deleting a photo, an album or
                          // a community note does. Firing straight from the
                          // menu meant one stray tap took the comment with no
                          // way back.
                          onSelect: () => setDeletingId(comment.id),
                        },
                      ]}
                    />
                  ) : (
                    <ItemActions
                      label="Comment actions"
                      copyLink={`/photos/${photoId}#comment-${comment.id}`}
                      report={{ targetType: 'comment', targetId: comment.id }}
                    />
                  )}
                </span>
              </div>
              <p className="text-sm text-neutral-300 mt-1">{comment.content}</p>
            </div>
          </div>
        ))}
        {status === 'ready' && comments.length === 0 && (
          <p className="text-sm text-neutral-600">No comments yet</p>
        )}
        {/* A real button rather than the grid's scroll sentinel: this list
            sits at the bottom of the photo page above "More like this", and a
            section that keeps growing as you scroll past it puts the rest of
            the page out of reach. */}
        {cursor ? (
          <div className="pt-2 text-center">
            <Button variant="outline" size="sm" onClick={loadMore} disabled={loadingMore}>
              {loadingMore ? 'Loading…' : 'Load more comments'}
            </Button>
          </div>
        ) : atEnd ? (
          /* What stands in the button's place once the last page has landed,
             so the press that loaded it has somewhere to leave focus and the
             button's disappearance is accounted for on screen too. */
          <p ref={endRef} tabIndex={-1} className={`pt-2 text-center text-xs text-neutral-600 ${focusRing}`}>
            That is the whole thread.
          </p>
        ) : null}
        {/* Rendered even when empty, so the live region exists before it has
            anything to say — one added afterwards is not announced. */}
        <p aria-live="polite" className="sr-only">{announcement}</p>
      </div>

      <ConfirmDialog
        open={deletingId !== null}
        title="Delete this comment?"
        confirmLabel="Delete"
        busyLabel="Deleting…"
        onConfirm={() => (deletingId ? handleDelete(deletingId) : undefined)}
        onClose={() => setDeletingId(null)}
      >
        The comment is removed for everyone. This cannot be undone.
      </ConfirmDialog>
    </div>
  )
}
