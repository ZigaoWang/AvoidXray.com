'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import type { FilmStockOption } from '@/lib/filmSearch'

type Photo = {
  id: string
  thumbnailPath: string
  caption: string | null
  cameraId: string | null
  filmStockId: string | null
  createdAt: string
  user: {
    username: string
  }
}

type Camera = { id: string; name: string; brand: string | null }

export default function UnpublishedPhotosManager() {
  const [photos, setPhotos] = useState<Photo[]>([])
  const [cameras, setCameras] = useState<Camera[]>([])
  const [filmStocks, setFilmStocks] = useState<FilmStockOption[]>([])
  const [loading, setLoading] = useState(true)
  const [publishing, setPublishing] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  // Bulk metadata for selected photos
  const [bulkCameraId, setBulkCameraId] = useState('')
  const [bulkFilmStockId, setBulkFilmStockId] = useState('')

  const fetchData = async () => {
    try {
      const [photosRes, camerasRes, filmStocksRes] = await Promise.all([
        fetch('/api/admin/unpublished'),
        fetch('/api/cameras'),
        fetch('/api/filmstocks')
      ])

      if (photosRes.ok) {
        setPhotos(await photosRes.json())
      }
      if (camerasRes.ok) {
        setCameras(await camerasRes.json())
      }
      if (filmStocksRes.ok) {
        setFilmStocks(await filmStocksRes.json())
      }
    } catch (error) {
      console.error('Failed to fetch data:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [])

  const handlePublish = async (photoId: string, cameraId?: string, filmStockId?: string) => {
    setPublishing(photoId)
    try {
      const res = await fetch(`/api/photos/${photoId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cameraId: cameraId || null,
          filmStockId: filmStockId || null
        })
      })
      if (res.ok) {
        setPhotos(prev => prev.filter(p => p.id !== photoId))
        setSelectedIds(prev => {
          const next = new Set(prev)
          next.delete(photoId)
          return next
        })
      } else {
        const error = await res.json()
        alert(`Failed to publish: ${error.error || 'Unknown error'}`)
      }
    } catch (error) {
      console.error('Failed to publish photo:', error)
      alert('Failed to publish photo')
    } finally {
      setPublishing(null)
    }
  }

  const handlePublishSelected = async () => {
    if (selectedIds.size === 0) return
    setPublishing('batch')

    const results = await Promise.allSettled(
      Array.from(selectedIds).map(id =>
        fetch(`/api/photos/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            cameraId: bulkCameraId || null,
            filmStockId: bulkFilmStockId || null
          })
        }).then(res => {
          if (!res.ok) throw new Error(`Failed for ${id}`)
          return id
        })
      )
    )

    const successIds = results
      .filter((r): r is PromiseFulfilledResult<string> => r.status === 'fulfilled')
      .map(r => r.value)

    setPhotos(prev => prev.filter(p => !successIds.includes(p.id)))
    setSelectedIds(new Set())
    setPublishing(null)

    const failCount = results.filter(r => r.status === 'rejected').length
    if (failCount > 0) {
      alert(`${failCount} photo(s) failed to publish`)
    }
  }

  const handleDelete = async (photoId: string) => {
    if (!confirm('Delete this photo permanently?')) return
    setPublishing(photoId)
    try {
      const res = await fetch(`/api/photos/${photoId}`, { method: 'DELETE' })
      if (res.ok) {
        setPhotos(prev => prev.filter(p => p.id !== photoId))
        setSelectedIds(prev => {
          const next = new Set(prev)
          next.delete(photoId)
          return next
        })
      } else {
        const error = await res.json()
        alert(`Failed to delete: ${error.error || 'Unknown error'}`)
      }
    } catch (error) {
      console.error('Failed to delete photo:', error)
      alert('Failed to delete photo')
    } finally {
      setPublishing(null)
    }
  }

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const selectAll = () => {
    if (selectedIds.size === photos.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(photos.map(p => p.id)))
    }
  }

  const getCameraName = (id: string | null) => {
    if (!id) return null
    const camera = cameras.find(c => c.id === id)
    return camera ? (camera.brand ? `${camera.brand} ${camera.name}` : camera.name) : null
  }

  const getFilmName = (id: string | null) => {
    if (!id) return null
    const film = filmStocks.find(f => f.id === id)
    return film ? (film.brand ? `${film.brand} ${film.name}` : film.name) : null
  }

  if (loading) {
    return (
      <div className="bg-neutral-900 p-6 text-center">
        <div className="text-neutral-500">Loading unpublished photos...</div>
      </div>
    )
  }

  if (photos.length === 0) {
    return (
      <div className="bg-neutral-900 p-6 text-center">
        <div className="text-neutral-500">No unpublished photos</div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Bulk Actions Bar */}
      <div className="bg-neutral-900 border border-neutral-800 p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={selectAll}
              className="text-sm text-neutral-400 hover:text-white"
            >
              {selectedIds.size === photos.length ? 'Deselect All' : 'Select All'}
            </button>
            {selectedIds.size > 0 && (
              <span className="text-sm text-neutral-500">
                {selectedIds.size} selected
              </span>
            )}
          </div>
        </div>

        {/* Bulk metadata assignment */}
        {selectedIds.size > 0 && (
          <div className="border-t border-neutral-800 pt-4 space-y-3">
            <p className="text-sm text-neutral-400">Set metadata for selected photos before publishing:</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <select
                value={bulkCameraId}
                onChange={e => setBulkCameraId(e.target.value)}
                className="w-full p-2 bg-neutral-800 text-white border border-neutral-700 text-sm"
              >
                <option value="">No camera</option>
                {cameras.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.brand ? `${c.brand} ${c.name}` : c.name}
                  </option>
                ))}
              </select>

              <select
                value={bulkFilmStockId}
                onChange={e => setBulkFilmStockId(e.target.value)}
                className="w-full p-2 bg-neutral-800 text-white border border-neutral-700 text-sm"
              >
                <option value="">No film stock</option>
                {filmStocks.map(f => (
                  <option key={f.id} value={f.id}>
                    {f.brand ? `${f.brand} ${f.name}` : f.name}
                  </option>
                ))}
              </select>

              <button
                onClick={handlePublishSelected}
                disabled={publishing === 'batch'}
                className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium disabled:opacity-50"
              >
                {publishing === 'batch' ? 'Publishing...' : `Publish ${selectedIds.size} Photos`}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Photos Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
        {photos.map(photo => (
          <div
            key={photo.id}
            className={`relative group bg-neutral-900 border ${
              selectedIds.has(photo.id) ? 'border-green-500' : 'border-neutral-800'
            }`}
          >
            {/* Checkbox */}
            <button
              onClick={() => toggleSelect(photo.id)}
              className="absolute top-2 left-2 z-10 w-5 h-5 border border-neutral-600 bg-neutral-900/80 flex items-center justify-center"
            >
              {selectedIds.has(photo.id) && (
                <svg className="w-3 h-3 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              )}
            </button>

            {/* Image */}
            <div className="aspect-square relative">
              <Image
                src={photo.thumbnailPath}
                alt={photo.caption || ''}
                fill
                className="object-cover"
              />
            </div>

            {/* Info */}
            <div className="p-2 border-t border-neutral-800 space-y-1">
              <Link
                href={`/${photo.user.username}`}
                className="text-xs text-neutral-500 hover:text-white block truncate"
              >
                @{photo.user.username}
              </Link>
              {getCameraName(photo.cameraId) && (
                <div className="text-xs text-neutral-600 truncate" title={getCameraName(photo.cameraId) || ''}>
                  📷 {getCameraName(photo.cameraId)}
                </div>
              )}
              {getFilmName(photo.filmStockId) && (
                <div className="text-xs text-neutral-600 truncate" title={getFilmName(photo.filmStockId) || ''}>
                  🎞️ {getFilmName(photo.filmStockId)}
                </div>
              )}
              <div className="text-xs text-neutral-700">
                {new Date(photo.createdAt).toLocaleDateString()}
              </div>
            </div>

            {/* Hover Actions */}
            <div className="absolute inset-0 bg-black/70 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
              <button
                onClick={() => handlePublish(photo.id, photo.cameraId || undefined, photo.filmStockId || undefined)}
                disabled={publishing === photo.id}
                className="px-3 py-1 bg-green-600 hover:bg-green-700 text-white text-xs font-medium disabled:opacity-50"
              >
                {publishing === photo.id ? '...' : 'Publish'}
              </button>
              <button
                onClick={() => handleDelete(photo.id)}
                disabled={publishing === photo.id}
                className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white text-xs font-medium disabled:opacity-50"
              >
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
