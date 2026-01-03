'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'

interface Photo {
  id: string
  thumbnailPath: string
  user: { username: string }
}

export default function BatchPhotoManager({ photos }: { photos: Photo[] }) {
  const router = useRouter()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [deleting, setDeleting] = useState(false)

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectAll = () => {
    if (selected.size === photos.length) setSelected(new Set())
    else setSelected(new Set(photos.map(p => p.id)))
  }

  const deleteSelected = async () => {
    if (!selected.size || !confirm(`Delete ${selected.size} photos?`)) return
    setDeleting(true)

    await Promise.all(
      Array.from(selected).map(id =>
        fetch('/api/admin', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'photo', id })
        })
      )
    )

    setSelected(new Set())
    setDeleting(false)
    router.refresh()
  }

  return (
    <div>
      <div className="flex items-center gap-4 mb-4">
        <h2 className="text-lg font-bold text-white">Photos</h2>
        <button
          onClick={selectAll}
          className="text-xs text-neutral-400 hover:text-white"
        >
          {selected.size === photos.length ? 'Deselect All' : 'Select All'}
        </button>
        {selected.size > 0 && (
          <button
            onClick={deleteSelected}
            disabled={deleting}
            className="text-xs bg-red-600 text-white px-3 py-1 hover:bg-red-700 disabled:opacity-50"
          >
            {deleting ? 'Deleting...' : `Delete ${selected.size} Selected`}
          </button>
        )}
      </div>
      <div className="grid grid-cols-4 md:grid-cols-8 gap-2">
        {photos.map(p => (
          <div
            key={p.id}
            onClick={() => toggleSelect(p.id)}
            className={`relative aspect-square bg-neutral-800 cursor-pointer ${
              selected.has(p.id) ? 'ring-2 ring-red-500' : ''
            }`}
          >
            <Image src={p.thumbnailPath} alt="" fill className="object-cover" sizes="100px" />
            {selected.has(p.id) && (
              <div className="absolute top-1 right-1 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center">
                <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
              </div>
            )}
            <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-xs p-1 truncate">
              @{p.user.username}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
