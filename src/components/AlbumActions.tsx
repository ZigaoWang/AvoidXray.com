'use client'

import { useRouter } from 'next/navigation'

interface AlbumActionsProps {
  albumId: string
  albumName: string
}

export default function AlbumActions({ albumId, albumName }: AlbumActionsProps) {
  const router = useRouter()

  const handleDelete = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()

    if (!confirm(`Are you sure you want to delete the album "${albumName}"? Photos will not be deleted.`)) {
      return
    }

    const res = await fetch(`/api/albums/${albumId}`, { method: 'DELETE' })
    if (res.ok) {
      router.refresh()
    } else {
      alert('Failed to delete album')
    }
  }

  return (
    <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
      <button
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          router.push(`/albums/${albumId}/edit`)
        }}
        className="p-2 bg-black/60 hover:bg-black/80 text-white rounded transition-colors"
        title="Edit album"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
        </svg>
      </button>
      <button
        onClick={handleDelete}
        className="p-2 bg-black/60 hover:bg-red-600 text-white rounded transition-colors"
        title="Delete album"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
        </svg>
      </button>
    </div>
  )
}
