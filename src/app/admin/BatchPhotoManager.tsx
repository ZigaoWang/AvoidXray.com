'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'

interface Photo {
  id: string
  thumbnailPath: string
  mediumPath: string
  caption: string | null
  createdAt: string
  user: { username: string }
  camera: { name: string } | null
  filmStock: { name: string } | null
  _count: { likes: number; comments: number }
}

export default function BatchPhotoManager({ photos }: { photos: Photo[] }) {
  const router = useRouter()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [viewing, setViewing] = useState<Photo | null>(null)
  const [deleting, setDeleting] = useState(false)

  const toggleSelect = (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
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

  const deleteOne = async (id: string) => {
    if (!confirm('Delete this photo?')) return
    await fetch('/api/admin', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'photo', id })
    })
    setViewing(null)
    router.refresh()
  }

  return (
    <div>
      <div className="flex items-center gap-4 mb-4">
        <h2 className="text-lg font-bold text-white">Photos</h2>
        <button onClick={selectAll} className="text-xs text-neutral-400 hover:text-white">
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
            onClick={() => setViewing(p)}
            className={`relative aspect-square bg-neutral-800 cursor-pointer ${selected.has(p.id) ? 'ring-2 ring-red-500' : ''}`}
          >
            <Image src={p.thumbnailPath} alt="" fill className="object-cover" sizes="100px" />
            <button
              onClick={e => toggleSelect(e, p.id)}
              className={`absolute top-1 left-1 w-5 h-5 border-2 flex items-center justify-center ${
                selected.has(p.id) ? 'bg-red-500 border-red-500' : 'border-white/50 hover:border-white'
              }`}
            >
              {selected.has(p.id) && (
                <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
              )}
            </button>
            <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-xs p-1 truncate">
              @{p.user.username}
            </div>
          </div>
        ))}
      </div>

      {/* Photo Info Popup */}
      {viewing && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4" onClick={() => setViewing(null)}>
          <div className="bg-neutral-900 max-w-3xl w-full max-h-[90vh] overflow-auto" onClick={e => e.stopPropagation()}>
            <div className="grid md:grid-cols-2">
              <div className="relative aspect-square bg-black">
                <Image src={viewing.mediumPath} alt="" fill className="object-contain" />
              </div>
              <div className="p-4 space-y-3">
                <div className="flex justify-between items-start">
                  <h3 className="text-white font-bold">Photo Details</h3>
                  <button onClick={() => setViewing(null)} className="text-neutral-500 hover:text-white">✕</button>
                </div>

                <div className="space-y-2 text-sm">
                  <div><span className="text-neutral-500">ID:</span> <span className="text-neutral-300">{viewing.id}</span></div>
                  <div><span className="text-neutral-500">User:</span> <span className="text-neutral-300">@{viewing.user.username}</span></div>
                  <div><span className="text-neutral-500">Caption:</span> <span className="text-neutral-300">{viewing.caption || '—'}</span></div>
                  <div><span className="text-neutral-500">Camera:</span> <span className="text-neutral-300">{viewing.camera?.name || '—'}</span></div>
                  <div><span className="text-neutral-500">Film:</span> <span className="text-neutral-300">{viewing.filmStock?.name || '—'}</span></div>
                  <div><span className="text-neutral-500">Uploaded:</span> <span className="text-neutral-300">{new Date(viewing.createdAt).toLocaleString()}</span></div>
                  <div><span className="text-neutral-500">Likes:</span> <span className="text-neutral-300">{viewing._count.likes}</span></div>
                  <div><span className="text-neutral-500">Comments:</span> <span className="text-neutral-300">{viewing._count.comments}</span></div>
                </div>

                <div className="flex gap-2 pt-4 border-t border-neutral-800">
                  <Link
                    href={`/photos/${viewing.id}`}
                    className="flex-1 text-center py-2 bg-neutral-800 text-white text-sm hover:bg-neutral-700"
                  >
                    View Page
                  </Link>
                  <Link
                    href={`/photos/${viewing.id}/edit`}
                    className="flex-1 text-center py-2 bg-[#D32F2F] text-white text-sm hover:bg-[#B71C1C]"
                  >
                    Edit
                  </Link>
                  <button
                    onClick={() => deleteOne(viewing.id)}
                    className="flex-1 py-2 bg-red-900 text-white text-sm hover:bg-red-800"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
