'use client'
import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import Combobox from '@/components/Combobox'
import NewItemModal from '@/components/NewItemModal'
import { buildNewItemFormData, CREATE_ENDPOINT, type NewItemPayload } from '@/lib/newItemForm'
import FieldLabel from '@/components/ui/FieldLabel'
import { fieldClass } from '@/components/ui/Field'
import Button from '@/components/ui/Button'
import type { FilmStockOption } from '@/lib/filmSearch'
import VisibilityToggle, { type Visibility } from '@/components/ui/VisibilityToggle'
import { useToast } from '@/components/ui/Toast'
import { apiErrorMessage } from '@/lib/apiError'
import { textLinkClass } from '@/components/ui/TextLink'

type Camera = {
  id: string
  name: string
  brand: string | null
  imageUrl?: string | null
  cameraType?: string | null
  defaultFilmStockId?: string | null
}
type Photo = { id: string; caption: string | null; cameraId: string | null; filmStockId: string | null; takenDate: string | null; visibility: Visibility }

export default function EditPhotoPage({ params }: { params: Promise<{ id: string }> }) {
  const { status } = useSession()
  const router = useRouter()
  const { toast } = useToast()
  const [photo, setPhoto] = useState<Photo | null>(null)
  const [caption, setCaption] = useState('')
  const [cameraId, setCameraId] = useState('')
  const [filmStockId, setFilmStockId] = useState('')
  const [takenDate, setTakenDate] = useState('')
  const [visibility, setVisibility] = useState<Visibility>('PUBLIC')
  const [cameras, setCameras] = useState<Camera[]>([])
  const [filmStocks, setFilmStocks] = useState<FilmStockOption[]>([])
  const [saving, setSaving] = useState(false)
  const [photoId, setPhotoId] = useState<string>('')
  const [loadFailed, setLoadFailed] = useState(false)

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

  // None of these three checked the response. A 401, a 404 or a 500 came back
  // as `{ error: '…' }`, which was then handed to setPhoto — truthy, so the
  // form rendered with every field blank as though the photo had no caption,
  // no camera and no film — and to setCameras and setFilmStocks, where the
  // combobox calls .map on it and the page dies.
  useEffect(() => {
    if (!photoId) return
    let cancelled = false

    fetch(`/api/photos/${photoId}`)
      .then(r => (r.ok ? r.json() : Promise.reject(new Error())))
      .then(data => {
        if (cancelled) return
        setPhoto(data)
        setCaption(data.caption || '')
        setCameraId(data.cameraId || '')
        setFilmStockId(data.filmStockId || '')
        setVisibility(data.visibility === 'PRIVATE' ? 'PRIVATE' : 'PUBLIC')
        // Format date for input (YYYY-MM-DD)
        if (data.takenDate) {
          const date = new Date(data.takenDate)
          setTakenDate(date.toISOString().split('T')[0])
        }
      })
      .catch(() => { if (!cancelled) setLoadFailed(true) })

    fetch('/api/cameras')
      .then(r => (r.ok ? r.json() : []))
      .then(d => { if (!cancelled) setCameras(Array.isArray(d) ? d : []) })
      .catch(() => {})

    fetch('/api/filmstocks')
      .then(r => (r.ok ? r.json() : []))
      .then(d => { if (!cancelled) setFilmStocks(Array.isArray(d) ? d : []) })
      .catch(() => {})

    return () => { cancelled = true }
  }, [photoId])

  // A navigation belongs in an effect, not in the render body, where React is
  // free to run it more than once or throw the result away. It was also
  // unreachable: the `!photo` guard above returns first, so a signed-out
  // visitor sat on "Loading…" indefinitely.
  useEffect(() => {
    if (status === 'unauthenticated') router.replace('/login')
  }, [status, router])

  if (loadFailed) return (
    <div className="min-h-dvh bg-[#0a0a0a] flex items-center justify-center px-6">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-white mb-2">This photo could not be opened</h1>
        <p className="text-neutral-500 mb-6">It may have been deleted, or it may not be yours to edit.</p>
        <Link href="/manage" className={textLinkClass}>Back to your photos</Link>
      </div>
    </div>
  )

  if (status === 'loading' || status === 'unauthenticated' || !photo) return (
    <div className="min-h-dvh bg-[#0a0a0a] flex items-center justify-center">
      <div className="text-neutral-500">Loading…</div>
    </div>
  )

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)

    // The result was discarded and the page navigated to the photo either way,
    // so an edit the server refused — a rate limit, a caption over the cap, a
    // session that had expired — looked exactly like one that was saved, and
    // the change was simply gone.
    try {
      const res = await fetch(`/api/photos/${photoId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          caption,
          cameraId: cameraId || null,
          filmStockId: filmStockId || null,
          takenDate: takenDate || null,
          visibility,
        })
      })
      if (!res.ok) {
        toast(await apiErrorMessage(res, 'Could not save your changes'), 'error')
        return
      }
      router.push(`/photos/${photoId}`)
      router.refresh()
    } catch {
      toast('Could not reach the server. Your changes are still here.', 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleCreateCamera = async (data: NewItemPayload) => {
    setCreatingCamera(true)
    setCameraError(null)

    try {
      const res = await fetch(CREATE_ENDPOINT.camera, {
        method: 'POST',
        body: buildNewItemFormData('camera', data),
      })

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}))
        throw new Error(errorData.error || 'Failed to create camera')
      }

      const camera = await res.json()
      setCameras(prev => [...prev, camera])
      setCameraId(camera.id)
      if (camera.defaultFilmStockId) {
        setFilmStockId(camera.defaultFilmStockId)
      }
      setShowNewCameraModal(false)
    } catch (err) {
      setCameraError(err instanceof Error ? err.message : 'Failed to create camera')
    } finally {
      setCreatingCamera(false)
    }
  }

  const handleCreateFilm = async (data: NewItemPayload) => {
    setCreatingFilm(true)
    setFilmError(null)

    try {
      const res = await fetch(CREATE_ENDPOINT.film, {
        method: 'POST',
        body: buildNewItemFormData('film', data),
      })

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
    <div className="min-h-dvh bg-[#0a0a0a]">
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
            <FieldLabel>Caption</FieldLabel>
            <input
              type="text"
              value={caption}
              onChange={e => setCaption(e.target.value)}
              className={`${fieldClass}`}
            />
          </div>

          <div>
            <FieldLabel>Date taken</FieldLabel>
            <input
              type="date"
              value={takenDate}
              onChange={e => setTakenDate(e.target.value)}
              className={`${fieldClass}`}
            />
          </div>

          <Combobox
            options={cameras}
            value={cameraId}
            onChange={(id) => {
              setCameraId(id)
              const selected = cameras.find(c => c.id === id)
              if (selected?.defaultFilmStockId) {
                setFilmStockId(selected.defaultFilmStockId)
              }
            }}
            onAddNewClick={() => setShowNewCameraModal(true)}
            placeholder="Search…"
            label="Camera"
          />

          <Combobox
            options={filmStocks}
            value={filmStockId}
            onChange={setFilmStockId}
            onAddNewClick={() => setShowNewFilmModal(true)}
            placeholder="Search…"
            label="Film Stock"
          />

          <VisibilityToggle value={visibility} onChange={v => setVisibility(v as Visibility)} />

          <div className="flex gap-4 pt-4">
            <Button
              type="submit"
              disabled={saving} className="flex-1">
              {saving ? 'Saving…' : 'Save'}
            </Button>
            <Link
              href={`/photos/${photoId}`}
              className="flex-1 bg-neutral-800 text-white py-3 text-sm font-medium hover:bg-neutral-700 text-center transition-colors"
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
          filmStocks={filmStocks}
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
