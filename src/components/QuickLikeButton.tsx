'use client'
import { useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'

export default function QuickLikeButton({ photoId, initialLiked, initialCount }: { photoId: string; initialLiked: boolean; initialCount: number }) {
  const { data: session } = useSession()
  const router = useRouter()
  const [liked, setLiked] = useState(initialLiked)
  const [count, setCount] = useState(initialCount)

  const handleLike = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()

    if (!session) {
      router.push('/login')
      return
    }

    const newLiked = !liked
    setLiked(newLiked)
    setCount(c => newLiked ? c + 1 : c - 1)

    await fetch('/api/likes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ photoId })
    })
  }

  return (
    <button
      onClick={handleLike}
      className="absolute top-1.5 right-1.5 bg-black/60 hover:bg-black/80 text-white text-[10px] px-1.5 py-0.5 rounded-full flex items-center gap-1 transition-all opacity-0 group-hover:opacity-100 hover:scale-110"
    >
      <span className={liked ? 'text-red-500' : ''}>{liked ? '♥' : '♡'}</span>
      {count > 0 && <span>{count}</span>}
    </button>
  )
}
