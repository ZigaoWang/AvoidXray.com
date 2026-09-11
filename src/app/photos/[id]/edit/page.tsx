'use client'
import { useState, useEffect, useId } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import ClientHeader from '@/components/ClientHeader'
import Footer from '@/components/Footer'
import Combobox from '@/components/Combobox'
import NewItemModal from '@/components/NewItemModal'
import { buildNewItemFormData, CREATE_ENDPOINT, type NewItemPayload } from '@/lib/newItemForm'
import FieldLabel from '@/components/ui/FieldLabel'
import { fieldClass } from '@/components/ui/Field'
import Button, { ButtonLink } from '@/components/ui/Button'
import { PhotoFormSkeleton } from '@/components/ui/Skeleton'
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
type Photo = { id: string; userId: string; caption: string | null; cameraId: string | null; filmStockId: string | null; takenDate: string | null; visibility: Visibility }

export default function EditPhotoPage({ params }: { params: Promise<{ id: string }> }) {
  // Prefix for this form's control ids, so a label points at its own field
  // even when the page renders the form twice.
  const fid = useId()

  const { data: session, status } = useSession()
  const viewerId = (session?.user as { id?: string } | undefined)?.id ?? null
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
  // 'missing' is an answer from the server — no such photo, or not yours.
  // 'unavailable' is the site failing to answer at all, which is worth
  // distinguishing: see the two failure screens below.
  const [loadError, setLoadError] = useState<'missing' | 'unavailable' | null>(null)

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
    let canceled = false

    fetch(`/api/photos/${photoId}`)
      // The endpoint answers 404 both for a photo that is not there and for one
      // you may not see, so that is the only status that means "gone". A 500 or
      // a dropped connection used to land on the same screen, which told people
      // their photo may have been deleted when it was sitting there untouched.
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(r.status === 404 ? 'missing' : 'unavailable'))))
      .then(data => {
        if (canceled) return
        // A public photo answers to anyone, so loading one is not permission
        // to edit it. Without this the form rendered over somebody else's
        // photo and only refused at the point of saving.
        if (data.userId !== viewerId) {
          setLoadError('missing')
          return
        }
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
      .catch((err: Error) => { if (!canceled) setLoadError(err.message === 'missing' ? 'missing' : 'unavailable') })

    fetch('/api/cameras')
      .then(r => (r.ok ? r.json() : []))
      .then(d => { if (!canceled) setCameras(Array.isArray(d) ? d : []) })
      .catch(() => {})

    fetch('/api/filmstocks')
      .then(r => (r.ok ? r.json() : []))
      .then(d => { if (!canceled) setFilmStocks(Array.isArray(d) ? d : []) })
      .catch(() => {})

    return () => { canceled = true }
  }, [photoId, viewerId])

  // A navigation belongs in an effect, not in the render body, where React is
  // free to run it more than once or throw the result away. It was also
  // unreachable: the `!photo` guard above returns first, so a signed-out
  // visitor sat on "Loading…" indefinitely.
  useEffect(() => {
    if (status === 'unauthenticated') router.replace('/login')
  }, [status, router])

  // Both of these sat on a bare black page with no header and no footer, so a
  // photo that would not open dropped you out of the site entirely. Settings
  // is the screen this follows.
  if (loadError) return (
    <div className="min-h-dvh bg-[#0a0a0a] flex flex-col">
      <ClientHeader />
      <main id="main-content" tabIndex={-1} className="flex-1 flex items-center justify-center px-6">
        <div className="text-center">
          {loadError === 'missing' ? (
            <>
              <h1 className="text-2xl font-bold text-white mb-2">This photo could not be opened</h1>
              <p className="text-neutral-500 mb-6">It may have been deleted, or it may not be yours to edit.</p>
              <Link href="/manage" className={textLinkClass}>Back to your photos</Link>
            </>
          ) : (
            // Nothing to go back to here: the photo is fine, the request was
            // not, so the useful control is the one that asks again.
            <>
              <h1 className="text-2xl font-bold text-white mb-2">This photo could not be loaded</h1>
              <p className="text-neutral-500 mb-6">Nothing has been changed. Reloading the page usually works.</p>
              <Button onClick={() => window.location.reload()} size="sm">Try again</Button>
            </>
          )}
        </div>
      </main>
      <Footer />
    </div>
  )

  if (status === 'loading' || status === 'unauthenticated' || !photo) return (
    <div className="min-h-dvh bg-[#0a0a0a] flex flex-col">
      <ClientHeader />
      {/* The shape of the form that is coming, like every other route on the
          site, rather than the word "Loading" on an empty screen. */}
      <main id="main-content" tabIndex={-1} className="flex-1" aria-busy="true">
        <span className="sr-only" role="status">Loading</span>
        <PhotoFormSkeleton />
      </main>
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
        body: buildNewItemFormData(data),
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
        body: buildNewItemFormData(data),
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
    <div className="min-h-dvh bg-[#0a0a0a] flex flex-col">
      {/* The site's own header, not a lone logo: editing a photo is not a
          different site, and the album editor beside this one does the same. */}
      <ClientHeader />

      <main id="main-content" tabIndex={-1} className="flex-1 max-w-xl mx-auto w-full py-12 px-6">
        <Link href={`/photos/${photoId}`} className="text-neutral-500 hover:text-white text-sm mb-6 inline-block">
          &larr; Back to Photo
        </Link>
        <h1 className="text-4xl font-black text-white mb-8 tracking-tight">Edit Photo</h1>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <FieldLabel htmlFor={`${fid}-caption`}>Caption</FieldLabel>
            <input
              id={`${fid}-caption`}
              type="text"
              value={caption}
              onChange={e => setCaption(e.target.value)}
              className={`${fieldClass}`}
            />
          </div>

          <div>
            <FieldLabel htmlFor={`${fid}-taken-date`}>Date taken</FieldLabel>
            <input
              id={`${fid}-taken-date`}
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

          {/*
            One loud action and one way out, at the weights the album editor
            already uses for this same pair.

            Save and Cancel were two half-width boxes splitting the row, and
            the Cancel was hand-rolled: 44px of sentence-case gray beside a
            40px uppercase Button, so the two neither lined up with each other
            nor matched anything else on the site.
          */}
          <div className="flex items-center gap-2 pt-4">
            <Button type="submit" disabled={saving} size="lg">
              {saving ? 'Saving…' : 'Save'}
            </Button>
            <ButtonLink href={`/photos/${photoId}`} variant="ghost">
              Cancel
            </ButtonLink>
          </div>
        </form>
      </main>

      <Footer />

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
