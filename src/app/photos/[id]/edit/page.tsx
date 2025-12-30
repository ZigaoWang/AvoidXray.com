'use client'
import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Combobox from '@/components/Combobox'
import Logo from '@/components/Logo'

type Camera = { id: string; name: string; brand: string | null }
type FilmStock = { id: string; name: string; brand: string | null }
type Photo = { id: string; caption: string | null; cameraId: string | null; filmStockId: string | null }

export default function EditPhotoPage({ params }: { params: Promise<{ id: string }> }) {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [photo, setPhoto] = useState<Photo | null>(null)
  const [caption, setCaption] = useState('')
  const [cameraId, setCameraId] = useState('')
  const [filmStockId, setFilmStockId] = useState('')
  const [cameras, setCameras] = useState<Camera[]>([])
  const [filmStocks, setFilmStocks] = useState<FilmStock[]>([])
  const [saving, setSaving] = useState(false)
  const [photoId, setPhotoId] = useState<string>('')

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
      body: JSON.stringify({ caption, cameraId, filmStockId })
    })
    router.push(`/photos/${photoId}`)
  }

  const createCamera = async (name: string) => {
    const res = await fetch('/api/cameras', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name })
    })
    const camera = await res.json()
    setCameras(prev => [...prev, camera])
    return camera
  }

  const createFilmStock = async (name: string) => {
    const res = await fetch('/api/filmstocks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name })
    })
    const filmStock = await res.json()
    setFilmStocks(prev => [...prev, filmStock])
    return filmStock
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      <header className="py-5 px-6">
        <Logo />
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

          <Combobox
            options={cameras}
            value={cameraId}
            onChange={setCameraId}
            onCreate={createCamera}
            placeholder="Search..."
            label="Camera"
          />

          <Combobox
            options={filmStocks}
            value={filmStockId}
            onChange={setFilmStockId}
            onCreate={createFilmStock}
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
    </div>
  )
}
