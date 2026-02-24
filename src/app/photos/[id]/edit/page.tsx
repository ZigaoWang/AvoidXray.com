'use client'
import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import Combobox from '@/components/Combobox'

type Camera = { id: string; name: string; brand: string | null }
type FilmStock = { id: string; name: string; brand: string | null }
type Photo = { id: string; caption: string | null; cameraId: string | null; filmStockId: string | null; takenDate: string | null }

export default function EditPhotoPage({ params }: { params: Promise<{ id: string }> }) {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [photo, setPhoto] = useState<Photo | null>(null)
  const [caption, setCaption] = useState('')
  const [cameraId, setCameraId] = useState('')
  const [filmStockId, setFilmStockId] = useState('')
  const [takenDate, setTakenDate] = useState('')
  const [newCameraName, setNewCameraName] = useState('')
  const [newFilmName, setNewFilmName] = useState('')
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

    let finalCameraId = cameraId
    let finalFilmStockId = filmStockId

    if (newCameraName && cameraId.startsWith('new-')) {
      const res = await fetch('/api/cameras', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newCameraName })
      })
      const camera = await res.json()
      finalCameraId = camera.id
    }

    if (newFilmName && filmStockId.startsWith('new-')) {
      const res = await fetch('/api/filmstocks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newFilmName })
      })
      const filmStock = await res.json()
      finalFilmStockId = filmStock.id
    }

    await fetch(`/api/photos/${photoId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        caption,
        cameraId: finalCameraId.startsWith('new-') ? null : finalCameraId,
        filmStockId: finalFilmStockId.startsWith('new-') ? null : finalFilmStockId,
        takenDate: takenDate || null
      })
    })
    router.push(`/photos/${photoId}`)
  }

  const handleCameraCreate = async (name: string) => {
    setNewCameraName(name)
    const tempId = `new-${name}`
    const temp = { id: tempId, name, brand: null }
    setCameras(prev => [...prev, temp])
    return temp
  }

  const handleFilmCreate = async (name: string) => {
    setNewFilmName(name)
    const tempId = `new-${name}`
    const temp = { id: tempId, name, brand: null }
    setFilmStocks(prev => [...prev, temp])
    return temp
  }

  const handleCameraChange = (id: string) => {
    setCameraId(id)
    if (!id.startsWith('new-')) setNewCameraName('')
  }

  const handleFilmChange = (id: string) => {
    setFilmStockId(id)
    if (!id.startsWith('new-')) setNewFilmName('')
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
            onChange={handleCameraChange}
            onCreate={handleCameraCreate}
            placeholder="Search..."
            label="Camera"
          />

          <Combobox
            options={filmStocks}
            value={filmStockId}
            onChange={handleFilmChange}
            onCreate={handleFilmCreate}
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
