'use client'
import { useRouter } from 'next/navigation'

export default function DeleteButton({ photoId }: { photoId: string }) {
  const router = useRouter()

  const handleDelete = async () => {
    if (!confirm('Delete this photo?')) return
    await fetch(`/api/photos/${photoId}`, { method: 'DELETE' })
    router.push('/')
  }

  return (
    <button
      onClick={handleDelete}
      className="text-[#D32F2F] hover:text-white text-sm transition-colors font-medium"
    >
      Delete
    </button>
  )
}
