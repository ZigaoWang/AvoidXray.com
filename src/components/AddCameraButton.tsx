'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import NewItemModal from '@/components/NewItemModal'

type FilmStock = { id: string; name: string; brand: string | null; imageUrl?: string | null }

export default function AddCameraButton() {
  const { data: session } = useSession()
  const router = useRouter()
  const [showModal, setShowModal] = useState(false)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [filmStocks, setFilmStocks] = useState<FilmStock[]>([])

  useEffect(() => {
    fetch('/api/filmstocks')
      .then(r => r.json())
      .then(data => { if (Array.isArray(data)) setFilmStocks(data) })
      .catch(() => {})
  }, [])

  if (!session) return null

  const handleSubmit = async (data: {
    name: string
    description?: string
    image?: File
    cameraType?: string
    format?: string
    year?: string
    defaultFilmStockId?: string
  }) => {
    setCreating(true)
    setError(null)

    try {
      const formData = new FormData()
      formData.append('name', data.name)
      if (data.description) formData.append('description', data.description)
      if (data.image) formData.append('image', data.image)
      if (data.cameraType) formData.append('cameraType', data.cameraType)
      if (data.format) formData.append('format', data.format)
      if (data.year) formData.append('year', data.year)
      if (data.defaultFilmStockId) formData.append('defaultFilmStockId', data.defaultFilmStockId)

      const res = await fetch('/api/cameras', { method: 'POST', body: formData })

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}))
        throw new Error(errorData.error || 'Failed to create camera')
      }

      const camera = await res.json()
      setShowModal(false)
      router.push(`/cameras/${camera.id}`)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create camera')
    } finally {
      setCreating(false)
    }
  }

  return (
    <>
      <button
        onClick={() => setShowModal(true)}
        className="bg-[#D32F2F] hover:bg-[#B71C1C] text-white px-4 py-2 text-sm font-medium transition-colors flex items-center gap-2"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
        Add Camera
      </button>

      {showModal && (
        <NewItemModal
          type="camera"
          onSubmit={handleSubmit}
          onCancel={() => { setShowModal(false); setError(null) }}
          loading={creating}
          error={error}
          filmStocks={filmStocks}
        />
      )}
    </>
  )
}
