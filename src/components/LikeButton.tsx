'use client'
import { useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'

export default function LikeButton({ photoId, initialLiked, initialCount }: { photoId: string; initialLiked: boolean; initialCount: number }) {
  const { data: session } = useSession()
  const router = useRouter()
  const [liked, setLiked] = useState(initialLiked)
  const [count, setCount] = useState(initialCount)
  const [loading, setLoading] = useState(false)

  const handleLike = async () => {
    if (!session) {
      router.push('/login')
      return
    }

    setLoading(true)
    const res = await fetch('/api/likes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ photoId })
    })
    const data = await res.json()
    setLiked(data.liked)
    setCount(c => data.liked ? c + 1 : c - 1)
    setLoading(false)
  }

  return (
    <button
      onClick={handleLike}
      disabled={loading}
      className={`flex items-center gap-2 px-5 py-3 rounded-lg transition-colors ${
        liked
          ? 'bg-red-500/20 text-red-400 border border-red-500/30'
          : 'bg-[#1a1a1a] text-neutral-400 border border-neutral-800 hover:text-white hover:border-neutral-700'
      }`}
    >
      <span className="text-lg">{liked ? '♥' : '♡'}</span>
      <span>{count}</span>
    </button>
  )
}
