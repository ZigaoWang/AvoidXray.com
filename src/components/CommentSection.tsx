'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import Image from 'next/image'
import Link from 'next/link'
import { useToast } from './ui/Toast'

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
  const { toast } = useToast()

  useEffect(() => {
    fetch(`/api/comments/${photoId}`)
      .then(res => res.json())
      .then(setComments)
  }, [photoId])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!content.trim() || loading) return

    setLoading(true)
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
      toast('Failed to add comment', 'error')
    }
    setLoading(false)
  }

  const handleDelete = async (id: string) => {
    const res = await fetch(`/api/comments?id=${id}`, { method: 'DELETE' })
    if (res.ok) {
      setComments(prev => prev.filter(c => c.id !== id))
      toast('Comment deleted', 'success')
    }
  }

  const currentUserId = (session?.user as { username?: string })?.username

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-bold uppercase tracking-wide text-neutral-400">
        Comments ({comments.length})
      </h3>

      {session && (
        <form onSubmit={handleSubmit} className="flex gap-2">
          <input
            type="text"
            value={content}
            onChange={e => setContent(e.target.value)}
            placeholder="Add a comment..."
            className="flex-1 px-3 py-2 bg-neutral-900 border border-neutral-800 text-white text-sm focus:border-neutral-600 focus:outline-none"
          />
          <button
            type="submit"
            disabled={loading || !content.trim()}
            className="px-4 py-2 bg-[#D32F2F] text-white text-sm font-bold uppercase tracking-wide hover:bg-[#B71C1C] transition-colors disabled:opacity-50"
          >
            Post
          </button>
        </form>
      )}

      <div className="space-y-3">
        {comments.map(comment => (
          <div key={comment.id} className="flex gap-3 animate-fade-in">
            <Link href={`/${comment.user.username}`} className="hover:opacity-80 transition-opacity flex-shrink-0">
              <div className="w-9 h-9 bg-neutral-800 flex items-center justify-center text-xs font-bold overflow-hidden flex-shrink-0">
                {comment.user.avatar ? (
                  <Image src={comment.user.avatar} alt="" width={32} height={32} className="w-full h-full object-cover" />
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
                {currentUserId === comment.user.username && (
                  <button
                    onClick={() => handleDelete(comment.id)}
                    className="text-xs text-neutral-600 hover:text-red-500 ml-auto"
                  >
                    Delete
                  </button>
                )}
              </div>
              <p className="text-sm text-neutral-300 mt-1">{comment.content}</p>
            </div>
          </div>
        ))}
        {comments.length === 0 && (
          <p className="text-sm text-neutral-600">No comments yet</p>
        )}
      </div>
    </div>
  )
}
