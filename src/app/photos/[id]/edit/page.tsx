'use client'
import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import Combobox from '@/components/Combobox'
import NewItemModal from '@/components/NewItemModal'

type Camera = { id: string; name: string; brand: string | null; imageUrl?: string | null }
type FilmStock = { id: string; name: string; brand: string | null; imageUrl?: string | null }
type Photo = { id: string; caption: string | null; cameraId: string | null; filmStockId: string | null; takenDate: string | null }

export default function EditPhotoPage({ params }: { params: Promise<{ id: string }> }) {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [photo, setPhoto] = useState<Photo | null>(null)
  const [caption, setCaption] = useState('')
  const [cameraId, setCameraId] = useState('')
  const [filmStockId, setFilmStockId] = useState('')
  const [takenDate, setTakenDate] = useState('')
  const [cameras, setCameras] = useState<Camera[]>([])
  const [filmStocks, setFilmStocks] = useState<FilmStock[]>([])
  const [saving, setSaving] = useState(false)
  const [photoId, setPhotoId] = useState<string>('')

  // Modal states
  const [showNewCameraModal, setShowNewCameraModal] = useState(false)
  const [showNewFilmModal, setShowNewFilmModal] = useState(false)
  const [creatingCamera, setCreatingCamera] = useState(false)
  const [creatingFilm, setCreatingFilm] = useState(false)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [filmError, setFilmError] = useState<string | null>(null)

  useEffect(() => {
    params.then(p => setPhotoId(p.id))
  }, [params])

  useEffect(() => {
    if (!photoId) return
    fetch(`/api/photos/${photoId}`).then(r => r.json()).then(data => {
      setPhoto(data)
      setCaption(data.caption || '')
      setCameraId(data.cameraId || '')
      setFilmStockId(data.filmStockId || '')
      // Format date for input (YYYY-MM-DD)
      if (data.takenDate) {
        const date = new Date(data.takenDate)
        setTakenDate(date.toISOString().split('T')[0])
      }
    })
    fetch('/api/cameras').then(r => r.json()).then(setCameras)
    fetch('/api/filmstocks').then(r => r.json()).then(setFilmStocks)
  }, [photoId])

  if (status === 'loading' || !photo) return (
    <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
      <div className="text-neutral-500">Loading...</div>
    </div>
  )
  if (!session) {
    router.push('/login')
    return null
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)

    await fetch(`/api/photos/${photoId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        caption,
        cameraId: cameraId || null,
        filmStockId: filmStockId || null,
        takenDate: takenDate || null
      })
    })
    router.push(`/photos/${photoId}`)
  }

  const handleCreateCamera = async (data: { name: string; description?: string; image?: File; cameraType?: string; format?: string; year?: string }) => {
    setCreatingCamera(true)
    setCameraError(null)

    try {
      const formData = new FormData()
      formData.append('name', data.name)
      if (data.description) formData.append('description', data.description)
      if (data.image) formData.append('image', data.image)
      if (data.cameraType) formData.append('cameraType', data.cameraType)
      if (data.format) formData.append('format', data.format)
      if (data.year) formData.append('year', data.year)

      const res = await fetch('/api/cameras', { method: 'POST', body: formData })

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}))
        throw new Error(errorData.error || 'Failed to create camera')
      }

      const camera = await res.json()
      setCameras(prev => [...prev, camera])
      setCameraId(camera.id)
      setShowNewCameraModal(false)
    } catch (err) {
      setCameraError(err instanceof Error ? err.message : 'Failed to create camera')
    } finally {
      setCreatingCamera(false)
    }
  }

  const handleCreateFilm = async (data: { name: string; description?: string; image?: File; filmType?: string; format?: string; iso?: string }) => {
    setCreatingFilm(true)
    setFilmError(null)

    try {
      const formData = new FormData()
      formData.append('name', data.name)
      if (data.description) formData.append('description', data.description)
      if (data.image) formData.append('image', data.image)
      if (data.filmType) formData.append('filmType', data.filmType)
      if (data.format) formData.append('format', data.format)
      if (data.iso) formData.append('iso', data.iso)

      const res = await fetch('/api/filmstocks', { method: 'POST', body: formData })

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}))
        throw new Error(errorData.error || 'Failed to create film stock')
      }

      const filmStock = await res.json()
      setFilmStocks(prev => [...prev, filmStock])
      setFilmStockId(filmStock.id)
      setShowNewFilmModal(false)
    } catch (err) {
      setFilmError(err instanceof Error ? err.message : 'Failed to create film stock')
    } finally {
      setCreatingFilm(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      <header className="py-5 px-6">
        <Link href="/">
          <Image src="/logo.svg" alt="AvoidXray" width={160} height={32} />
        </Link>
      </header>

      <main className="max-w-xl mx-auto py-12 px-6">
        <Link href={`/photos/${photoId}`} className="text-neutral-500 hover:text-white text-sm mb-6 inline-block">
          &larr; Back to Photo
        </Link>
        <h1 className="text-4xl font-black text-white mb-8 tracking-tight">Edit Photo</h1>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-neutral-500 text-xs uppercase tracking-wider mb-2 font-medium">Caption</label>
            <input
              type="text"
              value={caption}
              onChange={e => setCaption(e.target.value)}
              className="w-full p-3 bg-neutral-900 text-white border border-neutral-800 focus:border-[#D32F2F] focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-neutral-500 text-xs uppercase tracking-wider mb-2 font-medium">Taken Date</label>
            <input
              type="date"
              value={takenDate}
              onChange={e => setTakenDate(e.target.value)}
              className="w-full p-3 bg-neutral-900 text-white border border-neutral-800 focus:border-[#D32F2F] focus:outline-none"
            />
          </div>

          <Combobox
            options={cameras}
            value={cameraId}
            onChange={setCameraId}
            onAddNewClick={() => setShowNewCameraModal(true)}
            placeholder="Search..."
            label="Camera"
          />

          <Combobox
            options={filmStocks}
            value={filmStockId}
            onChange={setFilmStockId}
            onAddNewClick={() => setShowNewFilmModal(true)}
            placeholder="Search..."
            label="Film Stock"
          />

          <div className="flex gap-4 pt-4">
            <button
              type="submit"
              disabled={saving}
              className="flex-1 bg-[#D32F2F] text-white py-3 text-sm font-bold uppercase tracking-wider hover:bg-[#B71C1C] disabled:opacity-50 transition-colors"
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
            <Link
              href={`/photos/${photoId}`}
              className="flex-1 bg-neutral-800 text-white py-3 text-sm font-bold uppercase tracking-wider hover:bg-neutral-700 text-center transition-colors"
            >
              Cancel
            </Link>
          </div>
        </form>
      </main>

      {/* New Camera Modal */}
      {showNewCameraModal && (
        <NewItemModal
          type="camera"
          onSubmit={handleCreateCamera}
          onCancel={() => { setShowNewCameraModal(false); setCameraError(null) }}
          loading={creatingCamera}
          error={cameraError}
        />
      )}

      {/* New Film Modal */}
      {showNewFilmModal && (
        <NewItemModal
          type="film"
          onSubmit={handleCreateFilm}
          onCancel={() => { setShowNewFilmModal(false); setFilmError(null) }}
          loading={creatingFilm}
          error={filmError}
        />
      )}
    </div>
  )
}
