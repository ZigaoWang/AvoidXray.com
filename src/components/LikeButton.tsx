'use client'
import { useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'

interface LikedUser { username: string; name: string | null; avatar: string | null }

export default function LikeButton({ photoId, initialLiked, initialCount }: { photoId: string; initialLiked: boolean; initialCount: number }) {
  const { data: session } = useSession()
  const router = useRouter()
  const [liked, setLiked] = useState(initialLiked)
  const [count, setCount] = useState(initialCount)
  const [animating, setAnimating] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [likedBy, setLikedBy] = useState<LikedUser[]>([])
  const [loadingModal, setLoadingModal] = useState(false)

  const handleLike = async () => {
    if (!session) { router.push('/login'); return }
    const newLiked = !liked
    setLiked(newLiked)
    setCount(c => newLiked ? c + 1 : c - 1)
    if (newLiked) { setAnimating(true); setTimeout(() => setAnimating(false), 300) }
    await fetch('/api/likes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ photoId }) })
  }

  const handleShowLikes = async () => {
    if (count === 0) return
    setShowModal(true)
    setLoadingModal(true)
    const res = await fetch(`/api/likes?photoId=${photoId}`)
    if (res.ok) setLikedBy(await res.json())
    setLoadingModal(false)
  }

  return (
    <>
      <div className="flex items-center gap-2">
        <button onClick={handleLike} className={`text-lg transition-colors ${liked ? 'text-[#D32F2F]' : 'text-neutral-500 hover:text-white'} ${animating ? 'animate-heart-pop' : ''}`}>
          {liked ? '♥' : '♡'}
        </button>
        <button onClick={handleShowLikes} className={`text-sm transition-colors ${count > 0 ? 'text-neutral-400 hover:text-white' : 'text-neutral-600 cursor-default'}`}>
          {count}
        </button>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onClick={() => setShowModal(false)}>
          <div className="bg-neutral-900 border border-neutral-800 w-full max-w-sm mx-4 shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-800">
              <h3 className="text-sm font-bold text-white">Liked by</h3>
              <button onClick={() => setShowModal(false)} className="text-neutral-500 hover:text-white transition-colors">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="max-h-96 overflow-y-auto">
              {loadingModal ? (
                <div className="py-8 text-center text-neutral-500 text-sm">Loading...</div>
              ) : likedBy.map(u => (
                <Link key={u.username} href={`/${u.username}`} onClick={() => setShowModal(false)}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-neutral-800 transition-colors">
                  <div className="w-9 h-9 bg-neutral-700 flex items-center justify-center text-sm font-bold overflow-hidden shrink-0">
                    {u.avatar ? <Image src={u.avatar} alt="" width={36} height={36} className="w-full h-full object-cover" /> : (u.name || u.username).charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="text-white text-sm font-medium truncate">{u.name || u.username}</p>
                    <p className="text-neutral-500 text-xs truncate">@{u.username}</p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
