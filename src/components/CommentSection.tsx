'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import Image from 'next/image'
import Link from 'next/link'
import { useToast } from './ui/Toast'
import ItemActions from './ItemActions'
import { apiErrorMessage } from '@/lib/apiError'
import Button from '@/components/ui/Button'
import { fieldClass } from '@/components/ui/Field'
import { VALIDATION_LIMITS } from '@/lib/validation'

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
  const [status, setStatus] = useState<'loading' | 'ready' | 'failed'>('loading')
  const { toast } = useToast()

  // The response was piped straight into setComments with no check at all, so
  // a 500 or a rate limit put `{ error: '...' }` into a variable the render
  // then calls .map on — taking the whole photo page down with it. It also
  // could not tell "no comments" from "the list never arrived", and showed the
  // empty state for both.
  useEffect(() => {
    let cancelled = false
    setStatus('loading')

    fetch(`/api/comments/${photoId}`)
      .then(res => (res.ok ? res.json() : Promise.reject(new Error())))
      .then(data => {
        if (cancelled) return
        if (!Array.isArray(data)) throw new Error()
        setComments(data)
        setStatus('ready')
      })
      .catch(() => { if (!cancelled) setStatus('failed') })

    return () => { cancelled = true }
  }, [photoId])

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
        toast('Comment deleted', 'success')
      } else {
        // Silent failure left the comment on screen as though it had gone.
        toast(await apiErrorMessage(res, 'Could not delete that comment'), 'error')
      }
    } catch {
      toast('Could not reach the server', 'error')
    }
  }

  const currentUserId = (session?.user as { username?: string })?.username

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-bold uppercase tracking-wide text-neutral-400">
        {/* No count until there is one to give. It read "Comments (0)" while
            the list was still on its way, which is a statement about the
            photo, and it was wrong. */}
        Comments{status === 'ready' && ` (${comments.length})`}
      </h3>

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
            placeholder="Add a comment..."
            // The shared field style. This input had its own border colour and
            // padding, so the one place on a photo page you type sat a shade
            // off every other control on the site.
            className={`${fieldClass} flex-1`}
          />
          <Button type="submit" disabled={loading || !content.trim()} size="sm">
            {loading ? 'Posting…' : 'Post'}
          </Button>
        </form>
      ) : (
        // Signed out, the form simply was not rendered and nothing explained
        // why, so the section read as though comments were closed.
        <p className="text-sm text-neutral-500">
          <Link href="/login" className="text-white underline underline-offset-2 hover:text-[#D32F2F]">
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
                  {new Date(comment.createdAt).toLocaleDateString()}
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
                          onSelect: () => handleDelete(comment.id),
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
      </div>
    </div>
  )
}
