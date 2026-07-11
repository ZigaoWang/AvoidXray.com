'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import { useToast } from './ui/Toast'

type TargetType = 'camera' | 'filmstock'

interface Note {
  id: string
  content: string
  createdAt: string
  updatedAt: string
  edited: boolean
  user: { username: string; name: string | null; avatar: string | null }
  isAuthor: boolean
  helpfulCount: number
  votedHelpful: boolean
}

interface ListResponse {
  notes: Note[]
  canPost: boolean
  hasShotWith: boolean
  authenticated: boolean
}

interface Props {
  targetType: TargetType
  targetId: string
  targetLabel: string
}

const MIN_LEN = 3
const MAX_LEN = 2000
type Sort = 'helpful' | 'newest'

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const s = Math.floor(diff / 1000)
  if (s < 60) return 'just now'
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d < 7) return `${d}d ago`
  const w = Math.floor(d / 7)
  if (w < 5) return `${w}w ago`
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

export default function CommunityNotes({ targetType, targetId, targetLabel }: Props) {
  const { data: session, status: authStatus } = useSession()
  const router = useRouter()
  const { toast } = useToast()
  const [notes, setNotes] = useState<Note[] | null>(null)
  const [canPost, setCanPost] = useState(false)
  const [hasShotWith, setHasShotWith] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [showComposer, setShowComposer] = useState(false)
  const [content, setContent] = useState('')
  const [posting, setPosting] = useState(false)
  const [sort, setSort] = useState<Sort>('helpful')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editContent, setEditContent] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)
  const [voting, setVoting] = useState<Set<string>>(new Set())
  const composerRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/community-notes?targetType=${targetType}&targetId=${targetId}`, { cache: 'no-store' })
      .then(r => r.json())
      .then((data: ListResponse) => {
        if (cancelled) return
        setNotes(data.notes ?? [])
        setCanPost(!!data.canPost)
        setHasShotWith(!!data.hasShotWith)
        setLoaded(true)
      })
      .catch(() => {
        if (!cancelled) {
          setNotes([])
          setLoaded(true)
        }
      })
    return () => { cancelled = true }
  }, [targetType, targetId])

  // Autofocus composer on open + lock body scroll
  useEffect(() => {
    if (showComposer) {
      composerRef.current?.focus()
      const prev = document.body.style.overflow
      document.body.style.overflow = 'hidden'
      return () => { document.body.style.overflow = prev }
    }
  }, [showComposer])

  // ESC closes composer
  useEffect(() => {
    if (!showComposer) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowComposer(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [showComposer])

  const sorted = useMemo(() => {
    if (!notes) return []
    const arr = [...notes]
    if (sort === 'helpful') {
      arr.sort((a, b) => (b.helpfulCount - a.helpfulCount) || (new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()))
    } else {
      arr.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    }
    return arr
  }, [notes, sort])

  const topNote = useMemo(() => {
    if (!notes || notes.length === 0) return null
    const withVotes = notes.filter(n => n.helpfulCount >= 3)
    if (withVotes.length === 0) return null
    return withVotes.reduce((a, b) => (a.helpfulCount >= b.helpfulCount ? a : b))
  }, [notes])

  const trimmedLen = content.trim().length
  const remaining = MAX_LEN - trimmedLen
  const canSubmit = canPost && trimmedLen >= MIN_LEN && trimmedLen <= MAX_LEN
  const targetKind = targetType === 'camera' ? 'camera' : 'film stock'

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!canSubmit || posting) return
    setPosting(true)
    const res = await fetch('/api/community-notes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetType, targetId, content: content.trim() }),
    })
    if (res.ok) {
      const created = await res.json() as Note
      setNotes(prev => [created, ...(prev ?? [])])
      setContent('')
      setShowComposer(false)
      toast('Note posted', 'success')
    } else {
      const err = await res.json().catch(() => null)
      toast(err?.error ?? 'Failed to post', 'error')
    }
    setPosting(false)
  }

  const startEdit = (n: Note) => {
    setEditingId(n.id)
    setEditContent(n.content)
  }

  const saveEdit = async (id: string) => {
    const trimmed = editContent.trim()
    if (trimmed.length < MIN_LEN || trimmed.length > MAX_LEN || savingEdit) return
    setSavingEdit(true)
    const res = await fetch(`/api/community-notes/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: trimmed }),
    })
    if (res.ok) {
      const updated = await res.json() as Note
      setNotes(prev => (prev ?? []).map(n => n.id === id ? updated : n))
      setEditingId(null)
      toast('Note updated', 'success')
    } else {
      const err = await res.json().catch(() => null)
      toast(err?.error ?? 'Failed to update', 'error')
    }
    setSavingEdit(false)
  }

  const del = async (id: string) => {
    if (!confirm('Delete this note?')) return
    const res = await fetch(`/api/community-notes/${id}`, { method: 'DELETE' })
    if (res.ok) {
      setNotes(prev => (prev ?? []).filter(n => n.id !== id))
      toast('Note deleted', 'success')
    } else {
      toast('Failed to delete', 'error')
    }
  }

  const toggleVote = async (n: Note) => {
    if (!session) {
      router.push('/login')
      return
    }
    if (n.isAuthor) return
    if (voting.has(n.id)) return

    setVoting(prev => new Set(prev).add(n.id))
    setNotes(prev => (prev ?? []).map(x => x.id === n.id
      ? { ...x, votedHelpful: !x.votedHelpful, helpfulCount: x.helpfulCount + (x.votedHelpful ? -1 : 1) }
      : x))
    const res = await fetch(`/api/community-notes/${n.id}/vote`, { method: 'POST' })
    if (res.ok) {
      const data = await res.json() as { votedHelpful: boolean; helpfulCount: number }
      setNotes(prev => (prev ?? []).map(x => x.id === n.id
        ? { ...x, votedHelpful: data.votedHelpful, helpfulCount: data.helpfulCount }
        : x))
    } else {
      setNotes(prev => (prev ?? []).map(x => x.id === n.id
        ? { ...x, votedHelpful: !x.votedHelpful, helpfulCount: x.helpfulCount + (x.votedHelpful ? 1 : -1) }
        : x))
      toast('Vote failed', 'error')
    }
    setVoting(prev => {
      const next = new Set(prev)
      next.delete(n.id)
      return next
    })
  }

  const openComposer = () => {
    if (authStatus !== 'authenticated') {
      router.push('/login')
      return
    }
    if (!canPost) {
      toast(`Upload a photo shot with this ${targetKind} to unlock notes`, 'info')
      return
    }
    setShowComposer(true)
  }

  const count = notes?.length ?? 0

  // Post-note CTA — mirrors site red button pattern
  let ctaLabel = 'Add Note'
  let ctaTitle = 'Share your take'
  if (authStatus === 'unauthenticated') {
    ctaLabel = 'Sign in to Post'
    ctaTitle = 'Sign in to post a note'
  } else if (authStatus === 'authenticated' && !hasShotWith) {
    ctaLabel = 'Shoot to Unlock'
    ctaTitle = `Upload a photo shot with this ${targetKind} to unlock notes`
  }
  const ctaDisabled = authStatus === 'authenticated' && !hasShotWith

  return (
    <section>
      {/* Header — matches "Photos Shot On This Film" pattern */}
      <div className="flex items-center justify-between gap-4 mb-2">
        <div className="flex items-center gap-3">
          <h2 className="text-2xl font-bold text-white">Community Notes</h2>
          {loaded && count > 0 && (
            <span className="text-neutral-500 text-sm">{count} {count === 1 ? 'note' : 'notes'}</span>
          )}
        </div>
        <button
          type="button"
          onClick={openComposer}
          disabled={ctaDisabled}
          title={ctaTitle}
          className={`flex items-center gap-1.5 h-8 px-4 text-xs uppercase tracking-wide font-bold transition-colors ${
            ctaDisabled
              ? 'bg-neutral-900 border border-neutral-800 text-neutral-500 cursor-not-allowed'
              : 'bg-[#D32F2F] hover:bg-[#B71C1C] text-white'
          }`}
        >
          {!ctaDisabled && (
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
            </svg>
          )}
          {ctaDisabled && (
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          )}
          {ctaLabel}
        </button>
      </div>

      <p className="text-sm text-neutral-500 mb-6">
        Real-world takes from shooters who&apos;ve used this {targetKind}. Exposure tips, dev quirks, hidden strengths.
      </p>

      {/* Sort */}
      {loaded && notes && notes.length > 1 && (
        <div className="flex items-center gap-1 text-xs mb-4">
          <span className="text-neutral-600 uppercase tracking-wide mr-2">Sort</span>
          <button
            type="button"
            onClick={() => setSort('helpful')}
            className={`px-2.5 py-1 uppercase tracking-wider font-medium transition-colors ${
              sort === 'helpful' ? 'text-white border-b border-white' : 'text-neutral-500 hover:text-neutral-300'
            }`}
          >
            Helpful
          </button>
          <button
            type="button"
            onClick={() => setSort('newest')}
            className={`px-2.5 py-1 uppercase tracking-wider font-medium transition-colors ${
              sort === 'newest' ? 'text-white border-b border-white' : 'text-neutral-500 hover:text-neutral-300'
            }`}
          >
            Newest
          </button>
        </div>
      )}

      {/* List */}
      {!loaded ? (
        <div className="space-y-4">
          {[0, 1].map(i => (
            <div key={i} className="flex gap-3 animate-pulse">
              <div className="w-9 h-9 bg-neutral-900 flex-shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-3 bg-neutral-900 w-32" />
                <div className="h-3 bg-neutral-900 w-full" />
                <div className="h-3 bg-neutral-900 w-3/4" />
              </div>
            </div>
          ))}
        </div>
      ) : sorted.length === 0 ? (
        <div className="text-center py-10 border border-neutral-800 border-dashed">
          <svg className="w-8 h-8 text-neutral-700 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
          <p className="text-sm text-neutral-500">
            {canPost
              ? `No notes yet. Be first to share what you learned shooting ${targetLabel}.`
              : `No notes yet on ${targetLabel}.`}
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-neutral-900">
          {sorted.map(n => {
            const isTop = topNote?.id === n.id && sort === 'helpful'
            const isEditing = editingId === n.id
            return (
              <li
                key={n.id}
                className={`flex gap-3 py-4 first:pt-0 animate-fade-in ${isTop ? 'border-l-2 border-[#D32F2F] pl-4 -ml-4' : ''}`}
              >
                <Link href={`/${n.user.username}`} className="flex-shrink-0 hover:opacity-80 transition-opacity">
                  <div className="w-9 h-9 bg-neutral-800 flex items-center justify-center text-xs font-bold text-white overflow-hidden">
                    {n.user.avatar ? (
                      <Image src={n.user.avatar} alt="" width={36} height={36} className="w-full h-full object-cover" />
                    ) : (
                      (n.user.name || n.user.username).charAt(0).toUpperCase()
                    )}
                  </div>
                </Link>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <Link href={`/${n.user.username}`} className="text-sm font-medium text-white hover:underline truncate">
                      {n.user.name || n.user.username}
                    </Link>
                    <span className="text-xs text-neutral-600">·</span>
                    <span className="text-xs text-neutral-600" title={new Date(n.createdAt).toLocaleString()}>
                      {timeAgo(n.createdAt)}
                    </span>
                    {n.edited && <span className="text-xs text-neutral-600 italic">(edited)</span>}
                    {isTop && (
                      <span className="text-[10px] px-1.5 py-0.5 bg-[#D32F2F]/10 text-[#D32F2F] uppercase tracking-widest font-bold">
                        Top
                      </span>
                    )}
                  </div>

                  {isEditing ? (
                    <div>
                      <textarea
                        value={editContent}
                        onChange={e => setEditContent(e.target.value.slice(0, MAX_LEN))}
                        rows={3}
                        className="w-full px-3 py-2 bg-neutral-900 border border-neutral-700 text-white text-sm focus:border-neutral-500 focus:outline-none resize-y"
                      />
                      <div className="flex items-center gap-2 mt-2">
                        <button
                          onClick={() => saveEdit(n.id)}
                          disabled={savingEdit || editContent.trim().length < MIN_LEN}
                          className="bg-[#D32F2F] hover:bg-[#B71C1C] text-white text-xs px-4 h-7 uppercase tracking-wide font-bold transition-colors disabled:opacity-40"
                        >
                          {savingEdit ? 'Saving…' : 'Save'}
                        </button>
                        <button
                          onClick={() => setEditingId(null)}
                          className="text-neutral-500 hover:text-white text-xs uppercase tracking-wide font-medium px-2 h-7 transition-colors"
                        >
                          Cancel
                        </button>
                        <span className={`ml-auto text-xs ${editContent.trim().length < MIN_LEN ? 'text-amber-500' : 'text-neutral-600'}`}>
                          {editContent.trim().length}/{MAX_LEN}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-neutral-200 whitespace-pre-wrap break-words leading-relaxed">
                      {n.content}
                    </p>
                  )}

                  {!isEditing && (
                    <div className="flex items-center gap-3 mt-2">
                      <button
                        onClick={() => toggleVote(n)}
                        disabled={n.isAuthor || voting.has(n.id)}
                        title={n.isAuthor ? 'You wrote this' : n.votedHelpful ? 'Remove helpful' : 'Mark helpful'}
                        className={`inline-flex items-center gap-1.5 text-xs px-2 py-1 border transition-colors ${
                          n.isAuthor
                            ? 'border-neutral-800 text-neutral-600 cursor-not-allowed'
                            : n.votedHelpful
                              ? 'border-[#D32F2F] text-[#D32F2F] bg-[#D32F2F]/5'
                              : 'border-neutral-800 text-neutral-400 hover:border-neutral-600 hover:text-white'
                        }`}
                      >
                        <svg viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                          <path d="M2 10a2 2 0 012-2h1v9H4a2 2 0 01-2-2v-5zM7 17V8l3.5-5a1.5 1.5 0 012.5 1.66L11.5 8H16a2 2 0 012 2v1.5a2 2 0 01-.3 1L15 17H7z" />
                        </svg>
                        <span className="font-medium">Helpful</span>
                        {n.helpfulCount > 0 && <span className="tabular-nums">{n.helpfulCount}</span>}
                      </button>

                      {n.isAuthor && (
                        <>
                          <button
                            onClick={() => startEdit(n)}
                            className="text-xs text-neutral-500 hover:text-white transition-colors"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => del(n.id)}
                            className="text-xs text-neutral-500 hover:text-red-500 transition-colors"
                          >
                            Delete
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {/* Compose modal — mirrors SuggestEditModal pattern */}
      {showComposer && (
        <div
          className="fixed inset-0 bg-black/80 z-50 flex items-start justify-center overflow-y-auto p-4 md:p-6"
          onClick={() => setShowComposer(false)}
        >
          <div
            className="bg-neutral-900 border border-neutral-800 w-full max-w-2xl my-4 md:my-8 animate-fade-in"
            onClick={e => e.stopPropagation()}
          >
            <div className="p-4 md:p-6">
              <div className="flex items-center justify-between mb-4 md:mb-6">
                <div>
                  <h2 className="text-xl md:text-2xl font-bold text-white">Post a Community Note</h2>
                  <p className="text-neutral-500 text-sm mt-1">{targetLabel}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowComposer(false)}
                  className="text-neutral-500 hover:text-white flex-shrink-0 ml-4"
                  aria-label="Close"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <form onSubmit={submit}>
                <label className="block text-xs uppercase tracking-wide text-neutral-400 mb-2 font-medium">
                  Your take
                </label>
                <textarea
                  ref={composerRef}
                  value={content}
                  onChange={e => setContent(e.target.value.slice(0, MAX_LEN))}
                  placeholder={targetType === 'camera'
                    ? `e.g. Meter tends to overexpose by half a stop. Shoot at box speed +0.5 EV for shadow detail.`
                    : `e.g. This stock is overrated — shoot at ISO 100, not box speed. Exposure latitude is poor, overexpose by a stop.`}
                  rows={6}
                  className="w-full px-3 py-2.5 bg-neutral-950 border border-neutral-800 text-white text-sm placeholder:text-neutral-600 focus:border-neutral-600 focus:outline-none resize-y min-h-[140px]"
                />

                <div className="flex items-center justify-between mt-2 mb-6 gap-2">
                  <span className="text-xs text-neutral-600">
                    Markdown not supported. Line breaks preserved.
                  </span>
                  <span className={`text-xs tabular-nums ${remaining < 0 ? 'text-red-500' : remaining < 100 ? 'text-amber-500' : 'text-neutral-600'}`}>
                    {trimmedLen}/{MAX_LEN}
                  </span>
                </div>

                <div className="flex items-center justify-end gap-2 pt-4 border-t border-neutral-800">
                  <button
                    type="button"
                    onClick={() => setShowComposer(false)}
                    className="text-neutral-400 hover:text-white text-xs uppercase tracking-wide font-medium px-4 h-9 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={!canSubmit || posting}
                    className="bg-[#D32F2F] hover:bg-[#B71C1C] text-white text-xs px-5 h-9 uppercase tracking-wide font-bold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {posting ? 'Posting…' : 'Post Note'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
