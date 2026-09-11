'use client'
import { useState, useCallback, useEffect, useId, useRef, memo, Suspense } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import Combobox from '@/components/Combobox'
import ClientHeader from '@/components/ClientHeader'
import Footer from '@/components/Footer'
import NewItemModal from '@/components/NewItemModal'
import Button from '@/components/ui/Button'
import { buildNewItemFormData, CREATE_ENDPOINT, type NewItemPayload } from '@/lib/newItemForm'
import { createPreviewUrls, isHeic } from '@/lib/previewImage'
import { formatCaptureDate } from '@/lib/formatDate'
import MissingMetadataModal from '@/components/MissingMetadataModal'
import FieldLabel from '@/components/ui/FieldLabel'
import { fieldClass } from '@/components/ui/Field'
import type { FilmStockOption } from '@/lib/filmSearch'
import VisibilityToggle, { type VisibilityValue } from '@/components/ui/VisibilityToggle'
import { GUIDELINES } from '@/lib/guidelines'
import { apiErrorMessage } from '@/lib/apiError'
import Link from 'next/link'
import { useToast } from '@/components/ui/Toast'
import { IMAGE_FILE_ACCEPT } from '@/lib/validation'
import { focusRing } from '@/components/ui/focus'

type Camera = { id: string; name: string; brand: string | null; imageUrl?: string | null; cameraType?: string | null; defaultFilmStockId?: string | null }
const RULES_DISMISSED_KEY = 'avoidxray.uploadRulesDismissed'

type UploadStatus = 'uploading' | 'done' | 'error'
type PhotoMeta = {
  caption: string
  cameraId: string
  filmStockId: string
  takenDate: string
  /** '' on a per-photo entry means "use the batch default". */
  visibility: VisibilityValue
}
type Album = { id: string; name: string }
type TargetUser = { id: string; username: string; name: string | null }


/**
 * One tile in the upload grid.
 *
 * Memoized because the grid re-renders on every keystroke in the caption
 * field, and with fifty tiles that meant fifty image elements being
 * reconciled per character. Only the tile whose own props changed re-renders
 * now.
 */
const PhotoTile = memo(function PhotoTile({
  url,
  index,
  selected,
  status,
  error,
  hasCustomMeta,
  onSelect,
  onRemove,
}: {
  url: string
  index: number
  selected: boolean
  status: UploadStatus
  error: string | null
  hasCustomMeta: boolean
  onSelect: (index: number) => void
  onRemove: (index: number) => void
}) {
  // Selecting a tile switches the panel beside the grid to that photograph's
  // own caption, camera, film and visibility. It was a div with an onClick, so
  // that panel could only be reached with a pointer: tabbing through the grid
  // went from one tile's Remove button to the next tile's Remove button and
  // never focused a tile. A real button gets Enter and Space for free, and
  // aria-pressed says which one is showing, which the red ring alone did not.
  //
  // The remove control is a sibling rather than a child, because a button
  // inside a button is not something a browser will render as either.
  return (
    <div
      className={`aspect-square overflow-hidden bg-neutral-900 relative transition-all ${
        selected ? 'ring-2 ring-brand scale-[1.02]' : 'hover:opacity-80'
      }`}
    >
      <button
        type="button"
        onClick={() => onSelect(index)}
        aria-pressed={selected}
        aria-label={`Photo ${index + 1}${selected ? ', showing its details' : ''}`}
        className="absolute inset-0 z-0 cursor-pointer
                   focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px]
                   focus-visible:outline-brand"
      />
      {/* eslint-disable-next-line @next/next/no-img-element -- a blob URL from
          the local file, which next/image cannot optimize. */}
      <img src={url} alt="" loading="lazy" decoding="async" className="w-full h-full object-cover pointer-events-none" />
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onRemove(index) }}
        className="absolute top-1.5 left-1.5 grid h-9 w-9 place-items-center text-white hover:text-red-500 z-10 drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]
                   focus-visible:outline focus-visible:outline-1 focus-visible:outline-brand"
        aria-label={`Remove photo ${index + 1}`}
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
      {status === 'uploading' && (
        <div className="absolute inset-0 z-10 bg-black/70 flex items-center justify-center pointer-events-none">
          <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
        </div>
      )}
      {status === 'done' && (
        <div className="absolute top-1 right-1 z-10 w-5 h-5 bg-[#1B5E20] border border-[#2E7D32] rounded-full flex items-center justify-center shadow pointer-events-none">
          <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
          </svg>
        </div>
      )}
      {status === 'error' && (
        <>
          <div className="absolute top-1 right-1 z-10 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center shadow pointer-events-none">
            <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <div className="absolute inset-x-0 bottom-0 z-10 bg-red-950/90 px-1.5 py-1 text-[10px] leading-tight text-red-200 pointer-events-none">
            {error ?? 'Upload failed.'}
          </div>
        </>
      )}
      {hasCustomMeta && (
        <div className="absolute bottom-1 left-1 z-10 w-2 h-2 bg-blue-500 rounded-full pointer-events-none" aria-hidden />
      )}

      {/* Color and an icon are the whole of the status otherwise, and the
          explanation lived on a title attribute, which a screen reader is not
          obliged to read. */}
      <span className="sr-only">
        {status === 'uploading' && 'Uploading'}
        {status === 'done' && 'Uploaded'}
        {status === 'error' && `Upload failed. ${error ?? ''}`}
        {hasCustomMeta && ' Has its own details.'}
      </span>
    </div>
  )
})

function UploadPageContent() {
  // Prefix for this form's control ids, so a label points at its own field
  // even when the page renders the form twice.
  const fid = useId()

  const { status } = useSession()
  const router = useRouter()
  const { toast } = useToast()
  const searchParams = useSearchParams()
  const asUserId = searchParams.get('asUserId')
  // Set by the "Shoot to Unlock" link on a film or camera page, so arriving
  // from there lands on a form that already knows what you shot.
  const prefillFilmStockId = searchParams.get('film') ?? ''
  const prefillCameraId = searchParams.get('camera') ?? ''

  const [previews, setPreviews] = useState<string[]>([])
  const [uploadStatus, setUploadStatus] = useState<UploadStatus[]>([])
  // Why a given file failed, so the tile can explain itself rather than just
  // showing a red cross.
  const [uploadErrors, setUploadErrors] = useState<(string | null)[]>([])
  /**
   * Why a photo failed to *publish*, which is not the same as failing to
   * upload and must not be stored in the same place.
   *
   * Folding publish failures into uploadStatus marked the failed tiles 'error',
   * and the next attempt selected photos by `uploadStatus[i] === 'done'` — so
   * pressing "Try publishing again" re-sent exactly the photos that had already
   * published, found nothing wrong, reported success and navigated away. The
   * photos that actually failed were left unpublished, and the cleanup job
   * deletes unpublished photos an hour later. The upload was destroyed by the
   * button offered to rescue it.
   */
  const [publishErrors, setPublishErrors] = useState<Record<number, string>>({})
  // The ref, not state: every read of the uploaded ids goes through
  // photoIdsRef, so the parallel useState was written four times per upload
  // and never read — a re-render of the whole page per file for nothing.
  const photoIdsRef = useRef<(string | null)[]>([])
  // Tracked outside state so unmount can revoke them without a stale closure.
  const previewUrlsRef = useRef<string[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null)
  const [publishing, setPublishing] = useState(false)
  const [publishError, setPublishError] = useState<string | null>(null)
  const publishedRef = useRef(false)

  const [bulkMeta, setBulkMeta] = useState<PhotoMeta>({
    caption: '',
    cameraId: prefillCameraId,
    filmStockId: prefillFilmStockId,
    takenDate: '',
    visibility: 'PUBLIC',
  })
  const [individualMeta, setIndividualMeta] = useState<PhotoMeta[]>([])
  const [cameras, setCameras] = useState<Camera[]>([])
  const [filmStocks, setFilmStocks] = useState<FilmStockOption[]>([])
  const [addToAlbum, setAddToAlbum] = useState(false)
  const [confirmedFilm, setConfirmedFilm] = useState(false)
  const [albumName, setAlbumName] = useState('')
  const [albumPublic, setAlbumPublic] = useState(false)
  const [albums, setAlbums] = useState<Album[]>([])
  const [selectedAlbumId, setSelectedAlbumId] = useState('')
  const [albumsLoaded, setAlbumsLoaded] = useState(false)

  // Target user for "upload as user" feature
  const [targetUser, setTargetUser] = useState<TargetUser | null>(null)
  const [loadingTargetUser, setLoadingTargetUser] = useState(false)

  // Modal states
  const [newItemModal, setNewItemModal] = useState<{ type: 'camera' | 'film'; initialName?: string } | null>(null)
  const [creatingItem, setCreatingItem] = useState(false)
  const [itemError, setItemError] = useState<string | null>(null)
  const [showMissingMetadataModal, setShowMissingMetadataModal] = useState(false)

  // null until localStorage has been read, so someone who dismissed this does
  // not see it flash back on every visit.
  const [rulesVisible, setRulesVisible] = useState<boolean | null>(null)

  useEffect(() => {
    setRulesVisible(localStorage.getItem(RULES_DISMISSED_KEY) !== '1')
  }, [])

  const dismissRules = useCallback(() => {
    localStorage.setItem(RULES_DISMISSED_KEY, '1')
    setRulesVisible(false)
  }, [])

  // Fetch target user info if asUserId is present
  useEffect(() => {
    if (!asUserId) {
      setTargetUser(null)
      return
    }

    setLoadingTargetUser(true)
    fetch(`/api/user?id=${asUserId}`)
      .then(r => {
        if (!r.ok) throw new Error('User not found')
        return r.json()
      })
      .then(data => {
        setTargetUser({ id: data.id, username: data.username, name: data.name })
      })
      .catch(() => {
        // If user not found, redirect back to admin
        toast('That account was not found', 'error')
        router.push('/admin')
      })
      .finally(() => setLoadingTargetUser(false))
    // `toast` is a useCallback with no dependencies, so listing it is honest
    // rather than a re-run risk.
  }, [asUserId, router, toast])

  useEffect(() => {
    fetch('/api/cameras')
      .then(r => r.json())
      .then(data => {
        const list: Camera[] = Array.isArray(data) ? data : []
        setCameras(list)
        // A prefilled id from the query string is unverified. If it matches
        // nothing, clear it — the combobox would show an empty field while
        // still holding a value, and publish would fail on the foreign key.
        if (prefillCameraId && !list.some(c => c.id === prefillCameraId)) {
          setBulkMeta(prev => (prev.cameraId === prefillCameraId ? { ...prev, cameraId: '' } : prev))
        }
      })
      .catch(() => setCameras([]))

    fetch('/api/filmstocks')
      .then(r => r.json())
      .then(data => {
        const list: FilmStockOption[] = Array.isArray(data) ? data : []
        setFilmStocks(list)
        if (prefillFilmStockId && !list.some(f => f.id === prefillFilmStockId)) {
          setBulkMeta(prev => (prev.filmStockId === prefillFilmStockId ? { ...prev, filmStockId: '' } : prev))
        }
      })
      .catch(() => setFilmStocks([]))

    fetch('/api/albums')
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) {
          setAlbums(data)
        } else {
          setAlbums([])
        }
        setAlbumsLoaded(true)
      })
      .catch(() => {
        setAlbums([])
        setAlbumsLoaded(true)
      })
    // The prefill ids come from the URL and do not change while mounted.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Release every preview blob when the page goes away.
  useEffect(() => {
    const urls = previewUrlsRef
    return () => {
      for (const url of urls.current) URL.revokeObjectURL(url)
      urls.current = []
    }
  }, [])

  // Cleanup unpublished photos on unmount (client-side navigation)
  useEffect(() => {
    return () => {
      if (publishedRef.current) return
      const ids = photoIdsRef.current.filter(id => id)
      if (ids.length > 0) {
        // Use fetch for client-side navigation cleanup
        fetch('/api/upload/cleanup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids }),
          keepalive: true
        }).catch(() => {})
      }
    }
  }, [])

  const toggleSelected = useCallback((idx: number) => {
    setSelectedIdx(prev => (prev === idx ? null : idx))
  }, [])

  const removeImage = useCallback(async (idx: number) => {
    const photoId = photoIdsRef.current[idx]

    // Clean up OSS image if it was uploaded
    if (photoId) {
      fetch('/api/upload/cleanup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [photoId] }),
      }).catch(() => {})
    }

    // Release the preview's blob. Nothing revoked these before, so every
    // photo added in a session was held until the tab closed.
    const staleUrl = previewUrlsRef.current[idx]
    if (staleUrl) URL.revokeObjectURL(staleUrl)
    previewUrlsRef.current = previewUrlsRef.current.filter((_, i) => i !== idx)

    // Remove from all state arrays. uploadErrors was missed here, so after a
    // removal the remaining errors described the wrong photos.
    setPreviews(prev => prev.filter((_, i) => i !== idx))
    setUploadStatus(prev => prev.filter((_, i) => i !== idx))
    setUploadErrors(prev => prev.filter((_, i) => i !== idx))
    setIndividualMeta(prev => prev.filter((_, i) => i !== idx))
    photoIdsRef.current = photoIdsRef.current.filter((_, i) => i !== idx)

    // Publish errors are keyed by index, so removing a tile shifts every photo
    // after it out from under them. Publish three, have the second fail, remove
    // the first, and the photo that actually failed showed a green tick while
    // the one that published fine showed the failure.
    setPublishErrors(prev => {
      const shifted: Record<number, string> = {}
      for (const [key, message] of Object.entries(prev)) {
        const at = Number(key)
        if (at === idx) continue
        shifted[at > idx ? at - 1 : at] = message
      }
      return shifted
    })

    // Reset selection if the removed image was selected. Read through the
    // updater rather than closing over selectedIdx, so this callback stays
    // stable and PhotoTile's memo holds.
    setSelectedIdx(prev => {
      if (prev === null) return null
      if (prev === idx) return null
      return prev > idx ? prev - 1 : prev
    })
  }, [])

  // HEIC has no reliable MIME type from a file picker, so it is checked by
  // name as well; isHeic is shared with the preview pipeline.
  const isImageFile = useCallback(
    (file: File): boolean => file.type.startsWith('image/') || isHeic(file),
    []
  )

  const uploadFiles = useCallback(async (files: File[]) => {
    if (!files.length) return

    // Downscaled for display only — the original File is what gets uploaded.
    // Decoded a few at a time so a large drop cannot spike memory.
    const previewUrls = await createPreviewUrls(files)

    // Every array grows in one synchronous block, so a second drop landing
    // mid-decode appends after this one instead of writing over its tiles,
    // statuses and metadata.
    previewUrlsRef.current = [...previewUrlsRef.current, ...previewUrls]
    photoIdsRef.current = [...photoIdsRef.current, ...files.map(() => null)]

    setPreviews(prev => [...prev, ...previewUrls])
    setUploadStatus(prev => [...prev, ...files.map(() => 'uploading' as UploadStatus)])
    setUploadErrors(prev => [...prev, ...files.map(() => null)])
    setIndividualMeta(prev => [...prev, ...files.map(() => ({ caption: '', cameraId: '', filmStockId: '', takenDate: '', visibility: '' as VisibilityValue }))])

    // Removing a tile compacts every array, so the position a file started at
    // is not the position it finishes at. Addressing slots by a captured index
    // landed completions on the wrong tile or past the end: a tile could be
    // left 'uploading' for good, keeping Publish disabled, or worse, publish
    // one photo under another photo's caption, camera and film. The preview
    // URL stays with its tile for as long as the tile exists, so the slot is
    // looked up at write time and a vanished tile is skipped.
    const slotOf = (url: string) => previewUrlsRef.current.indexOf(url)

    // Upload sequentially to avoid SQLite write lock issues
    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      const key = previewUrls[i]
      try {
        const formData = new FormData()
        formData.append('files', file)
        // Pass asUserId if uploading as another user
        if (asUserId) {
          formData.append('asUserId', asUserId)
        }
        const res = await fetch('/api/upload', { method: 'POST', body: formData })
        if (res.ok) {
          const data = await res.json()
          const photoId: string = data.photos[0].id
          const idx = slotOf(key)
          if (idx === -1) {
            // removeImage had no id to clean up while this was in flight, so
            // the draft is orphaned on the server unless we say so now.
            fetch('/api/upload/cleanup', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ ids: [photoId] }),
            }).catch(() => {})
            continue
          }
          photoIdsRef.current[idx] = photoId
          setUploadStatus(prev => prev.map((s, j) => j === idx ? 'done' : s))
        } else {
          const reason = await res
            .json()
            .then(d => (typeof d?.error === 'string' ? d.error : null))
            .catch(() => null)
          const idx = slotOf(key)
          if (idx === -1) continue
          setUploadStatus(prev => prev.map((s, j) => j === idx ? 'error' : s))
          setUploadErrors(prev => prev.map((e, j) => j === idx ? (reason ?? 'Upload failed.') : e))
        }
      } catch {
        const idx = slotOf(key)
        if (idx === -1) continue
        setUploadStatus(prev => prev.map((s, j) => j === idx ? 'error' : s))
        setUploadErrors(prev => prev.map((e, j) => j === idx ? 'Network error. Check your connection and try again.' : e))
      }
    }
  }, [asUserId])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    uploadFiles(Array.from(e.dataTransfer.files).filter(isImageFile))
  }, [uploadFiles, isImageFile])

  // Handle new item modal submission — create immediately via API
  const handleNewItemSubmit = async (data: NewItemPayload) => {
    if (!newItemModal) return
    const { type } = newItemModal

    setCreatingItem(true)
    setItemError(null)

    try {
      const formData = buildNewItemFormData(type, data)

      if (type === 'camera') {
        const res = await fetch(CREATE_ENDPOINT.camera, { method: 'POST', body: formData })
        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          throw new Error(err.error || 'Failed to create camera')
        }
        const camera = await res.json()
        setCameras(prev => [...prev, camera])
        setBulkMeta(prev => ({
          ...prev,
          cameraId: camera.id,
          ...(camera.defaultFilmStockId && { filmStockId: camera.defaultFilmStockId })
        }))
      } else {
        const res = await fetch(CREATE_ENDPOINT.film, { method: 'POST', body: formData })
        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          throw new Error(err.error || 'Failed to create film stock')
        }
        const filmStock = await res.json()
        setFilmStocks(prev => [...prev, filmStock])
        setBulkMeta(prev => ({ ...prev, filmStockId: filmStock.id }))
      }

      setNewItemModal(null)
      setItemError(null)
    } catch (err) {
      setItemError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setCreatingItem(false)
    }
  }

  // Check for missing metadata before publishing
  const handlePublishClick = () => {
    // The button is disabled without this, but the guard means a keyboard or
    // programmatic path cannot walk around the confirmation either.
    if (!confirmedFilm) return
    const missingFields: ('camera' | 'film')[] = []
    if (!bulkMeta.cameraId) missingFields.push('camera')
    if (!bulkMeta.filmStockId) missingFields.push('film')

    if (missingFields.length > 0) {
      setShowMissingMetadataModal(true)
    } else {
      handlePublish()
    }
  }

  const handlePublish = async () => {
    const ids = photoIdsRef.current
    // Every photo that reached the server. Re-sending one that already
    // published is a no-op; leaving out one that failed is the bug this
    // replaces.
    const doneIds = ids.filter((id, i) => id && uploadStatus[i] === 'done')
    if (!doneIds.length) return
    setPublishing(true)
    setPublishError(null)
    setPublishErrors({})

    const photosToPublish = doneIds.length
    const failures: { index: number; reason: string }[] = []

    await Promise.all(ids.map(async (id, i) => {
      if (!id || uploadStatus[i] !== 'done') return

      // Use individual meta if set, otherwise fall back to bulk
      const ind = individualMeta[i]
      const meta = {
        caption: ind.caption || bulkMeta.caption,
        cameraId: ind.cameraId || bulkMeta.cameraId,
        filmStockId: ind.filmStockId || bulkMeta.filmStockId,
        takenDate: ind.takenDate || bulkMeta.takenDate,
        // '' on a photo means it follows the batch default.
        visibility: ind.visibility || bulkMeta.visibility || 'PUBLIC',
      }

      try {
        const res = await fetch(`/api/photos/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            caption: meta.caption || null,
            cameraId: meta.cameraId || null,
            filmStockId: meta.filmStockId || null,
            takenDate: meta.takenDate || null,
            visibility: meta.visibility,
          })
        })

        if (!res.ok) {
          failures.push({ index: i, reason: await apiErrorMessage(res, 'Could not publish this photo.') })
        }
      } catch {
        failures.push({ index: i, reason: 'Network error. Check your connection and try again.' })
      }
    }))

    // A photo that fails to publish stays unpublished, and the cleanup job
    // deletes unpublished photos an hour later. Redirecting on failure — which
    // is what happened before — meant the upload was silently destroyed while
    // the page behaved as though it had worked.
    if (failures.length > 0) {
      setPublishErrors(Object.fromEntries(failures.map(f => [f.index, f.reason])))
      setPublishing(false)
      setPublishError(
        failures.length === photosToPublish
          ? 'Nothing could be published. Your photos are still here, so try again.'
          : `${failures.length} of ${photosToPublish} photos could not be published. They are marked below and are still here; the rest were published.`
      )
      return
    }

    // Create or add to album if requested
    if (addToAlbum && (albumName.trim() || selectedAlbumId)) {
      const photoIdsToAdd = doneIds.filter(id => id !== null)
      let albumRes: Response | null = null

      // Wrapped, because this runs *after* the photos are published: a throw
      // here left the button on "Publishing..." for good, over an upload that
      // had actually succeeded, which invites pressing it again.
      try {
        if (selectedAlbumId) {
          // Add to existing album
          albumRes = await fetch(`/api/albums/${selectedAlbumId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ addPhotoIds: photoIdsToAdd })
          })
        } else if (albumName.trim()) {
          // Create new album
          albumRes = await fetch('/api/albums', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: albumName.trim(),
              public: albumPublic,
              photoIds: photoIdsToAdd
            })
          })
        }
      } catch {
        publishedRef.current = true
        setPublishing(false)
        setPublishError('Your photos were published, but the album could not be saved.')
        return
      }

      // The photos are published either way; only the album step failed, so
      // this reports that rather than discarding the whole upload. published
      // is set first so leaving the page does not trigger draft cleanup.
      if (albumRes && !albumRes.ok) {
        publishedRef.current = true
        setPublishing(false)
        setPublishError(
          await apiErrorMessage(albumRes, 'Your photos were published, but the album could not be saved.')
        )
        return
      }
    }

    publishedRef.current = true
    router.push('/')
  }

  // Redirecting from the render body is a side effect during render, which
  // React is free to run more than once or discard; an effect is where a
  // navigation belongs. Rendering nothing meanwhile avoids a flash of the
  // signed-out form.
  useEffect(() => {
    if (status === 'unauthenticated') router.replace('/login')
  }, [status, router])

  if (status === 'loading' || status === 'unauthenticated') return null

  const doneCount = uploadStatus.filter(s => s === 'done').length
  const uploadingCount = uploadStatus.filter(s => s === 'uploading').length
  const isIndividual = selectedIdx !== null
  const currentMeta = isIndividual ? individualMeta[selectedIdx] : bulkMeta

  const setCurrentMeta = (m: PhotoMeta) => {
    if (isIndividual) setIndividualMeta(prev => prev.map((p, i) => i === selectedIdx ? m : p))
    else setBulkMeta(m)
  }

  // Show loading state while fetching target user
  if (asUserId && loadingTargetUser) {
    return (
      <div className="min-h-dvh bg-[#0a0a0a] flex items-center justify-center">
        <div className="text-neutral-500">Loading user info…</div>
      </div>
    )
  }

  return (
    <div className="min-h-dvh bg-[#0a0a0a] flex flex-col">
      <ClientHeader />
      <main id="main-content" tabIndex={-1} className="flex-1 max-w-5xl mx-auto w-full py-12 px-6">
        {/* Admin Upload As User Banner */}
        {targetUser && (
          <div className="mb-6 p-4 bg-yellow-500/10 border border-yellow-500/30 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <svg className="w-5 h-5 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <div>
                <p className="text-yellow-500 font-medium">Admin Mode: Uploading as another user</p>
                <p className="text-yellow-500/70 text-sm">
                  Photos will be attributed to <span className="font-bold">@{targetUser.username}</span>
                  {targetUser.name && <span> ({targetUser.name})</span>}
                </p>
              </div>
            </div>
            <button
              onClick={() => router.push('/admin')}
              className="px-3 py-1 text-sm text-yellow-500 hover:text-yellow-400 border border-yellow-500/30 hover:border-yellow-500/50"
            >
              Cancel
            </button>
          </div>
        )}

        <div className="mb-6">
          <h1 className="text-3xl font-black text-white tracking-tight">
            {targetUser ? `Upload for @${targetUser.username}` : 'Upload Film Photos'}
          </h1>
          <p className="text-neutral-500 mt-1">Drop images to start uploading instantly</p>
        </div>

        <div className="grid lg:grid-cols-5 gap-8">
          {/* Left: Upload & Preview */}
          <div className="lg:col-span-3 space-y-4">
            {/* sr-only on the input, not `hidden`.
                Tailwind's `hidden` is display:none, which takes the input out
                of the tab order and out of the accessibility tree, and a
                <label> cannot be focused in its place. Nothing else here
                opens a file dialog and the drop zone needs a pointer, so
                uploading a photograph — the thing this site is for — could
                not be done from a keyboard at all. sr-only keeps it in the
                tab order and invisible, and focus-within puts the ring on the
                zone so the focus can be seen. */}
            <div
              onDrop={handleDrop}
              onDragOver={e => { e.preventDefault(); setIsDragging(true) }}
              onDragLeave={e => { e.preventDefault(); setIsDragging(false) }}
              className={`border-2 border-dashed p-10 text-center transition-all
                          focus-within:border-brand focus-within:ring-1 focus-within:ring-brand
                          ${isDragging ? 'border-brand bg-brand/5' : 'border-neutral-700 hover:border-neutral-600'}`}
            >
              <input type="file" multiple accept={IMAGE_FILE_ACCEPT} onChange={e => { uploadFiles(Array.from(e.target.files || []).filter(isImageFile)); e.target.value = '' }} className="sr-only" id="file-input" />
              <label htmlFor="file-input" className="cursor-pointer block">
                <div className="text-neutral-400 mb-2">
                  <svg className="w-10 h-10 mx-auto mb-3 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  Drop images here or click to browse
                </div>
                <p className="text-neutral-600 text-xs">JPG, PNG, TIFF • Uploads start immediately</p>
              </label>
            </div>

            {/* Dismissible: after the first read it is noise, and the line
                under the publish button keeps the rules one click away. Held
                in localStorage so it stays gone. */}
            {rulesVisible && (
              <div className="border border-neutral-800 p-5">
                <div className="flex items-start justify-between gap-4 mb-4">
                  <div>
                    <h2 className="text-white font-bold">Film only</h2>
                    <p className="text-sm text-neutral-500">
                      Every upload needs a film stock and a camera.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={dismissRules}
                    className="text-neutral-600 hover:text-white transition-colors -mt-1 -mr-1 p-1"
                    aria-label="Dismiss"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                <ul className="space-y-2">
                  {GUIDELINES.map(g => (
                    <li key={g.title} className="text-sm text-neutral-400 leading-relaxed">
                      <span className="text-neutral-200">{g.title}.</span> {g.short}
                    </li>
                  ))}
                </ul>
                <Link
                  href="/guidelines"
                  className="inline-block mt-4 text-sm text-neutral-500 hover:text-white underline underline-offset-2"
                >
                  Read the longer version
                </Link>
              </div>
            )}

            {previews.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-neutral-400">
                    {uploadingCount > 0 ? (
                      <span className="text-yellow-500">{uploadingCount} uploading…</span>
                    ) : (
                      <span className="text-green-400">{doneCount} ready</span>
                    )}
                    <span className="text-neutral-600 ml-2">/ {previews.length} total</span>
                  </span>
                  {isIndividual && (
                    <Button size="sm" onClick={() => setSelectedIdx(null)}>
                      ← All photos
                    </Button>
                  )}
                </div>

                {/* Three across on a phone, not five. Five was fixed at every
                    width, so on a 375px screen each frame was 56px — smaller
                    than the Remove button sitting on top of it. */}
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
                  {previews.map((url, i) => (
                    <PhotoTile
                      key={url}
                      url={url}
                      index={i}
                      selected={selectedIdx === i}
                      status={publishErrors[i] ? 'error' : uploadStatus[i]}
                      error={publishErrors[i] ?? uploadErrors[i] ?? null}
                      hasCustomMeta={Boolean(
                        individualMeta[i]?.caption ||
                        individualMeta[i]?.cameraId ||
                        individualMeta[i]?.filmStockId ||
                        individualMeta[i]?.takenDate
                      )}
                      onSelect={toggleSelected}
                      onRemove={removeImage}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right: Metadata */}
          <div className="lg:col-span-2">
            <div className="bg-neutral-900/50 border border-neutral-800 p-5 space-y-5">
              <div className="border-b border-neutral-800 pb-4">
                <h2 className="text-white font-semibold">
                  {isIndividual ? `Photo ${selectedIdx + 1}` : 'All Photos'}
                </h2>
                <p className="text-neutral-500 text-xs mt-1">
                  {isIndividual
                    ? 'Editing this photo only. Leave blank to use default.'
                    : 'Default metadata for all photos. Click a photo to customize.'}
                </p>
              </div>

              <div>
                <FieldLabel htmlFor={`${fid}-caption`}>Caption</FieldLabel>
                <input
                  id={`${fid}-caption`}
                  type="text"
                  value={currentMeta.caption}
                  onChange={e => setCurrentMeta({ ...currentMeta, caption: e.target.value })}
                  placeholder={isIndividual ? bulkMeta.caption || 'No default caption' : 'Enter caption…'}
                  className={`${fieldClass}`}
                />
              </div>

              <div>
                {/* The batch default has to be stated in the label. It used to
                    be a placeholder, which a date input never renders, so the
                    one person who needed to know there was no default to fall
                    back on was the one person who could not see it. */}
                <FieldLabel htmlFor={`${fid}-taken-date`}
                  hint={
                    isIndividual
                      ? bulkMeta.takenDate
                        ? `(default ${formatCaptureDate(bulkMeta.takenDate)})`
                        : '(no default)'
                      : undefined
                  }
                >
                  Date taken
                </FieldLabel>
                <input
                  id={`${fid}-taken-date`}
                  type="date"
                  value={currentMeta.takenDate}
                  onChange={e => setCurrentMeta({ ...currentMeta, takenDate: e.target.value })}
                  className={`${fieldClass}`}
                />
              </div>

              <div className="space-y-4">
                <Combobox
                  options={cameras}
                  value={currentMeta.cameraId}
                  onChange={id => {
                    const cam = cameras.find(c => c.id === id)
                    setCurrentMeta({
                      ...currentMeta,
                      cameraId: id,
                      ...(cam?.defaultFilmStockId && { filmStockId: cam.defaultFilmStockId })
                    })
                  }}
                  placeholder={isIndividual && bulkMeta.cameraId ? 'Using default' : 'Select…'}
                  label="Camera"
                  onAddNewClick={() => setNewItemModal({ type: 'camera' })}
                />
                <Combobox
                  options={filmStocks}
                  value={currentMeta.filmStockId}
                  onChange={id => setCurrentMeta({ ...currentMeta, filmStockId: id })}
                  placeholder={isIndividual && bulkMeta.filmStockId ? 'Using default' : 'Select…'}
                  label="Film Stock"
                  onAddNewClick={() => setNewItemModal({ type: 'film' })}
                />

                {/* Decided before publishing rather than after, so a photo
                    never goes public on its way to being made private. Per
                    photo it can fall back to the batch default. */}
                <VisibilityToggle
                  value={currentMeta.visibility}
                  onChange={v => setCurrentMeta({ ...currentMeta, visibility: v })}
                  allowInherit={isIndividual}
                  inheritedValue={bulkMeta.visibility === 'PRIVATE' ? 'PRIVATE' : 'PUBLIC'}
                  label={isIndividual ? 'Who can see this photo' : 'Who can see these photos'}
                />
              </div>

              <div className="border-t border-neutral-800 pt-5">
                <div className="bg-neutral-900 border border-neutral-800 p-4 space-y-3">
                  <label className="flex items-center gap-3 cursor-pointer group">
                    <input
                      type="checkbox"
                      checked={addToAlbum}
                      onChange={e => setAddToAlbum(e.target.checked)}
                      className="w-5 h-5 bg-neutral-800 border-2 border-neutral-700 checked:bg-brand checked:border-brand focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-2 focus:ring-offset-neutral-900 cursor-pointer"
                    />
                    <div className="flex-1">
                      <span className="text-white font-semibold text-sm block group-hover:text-brand transition-colors">
                        Add to Album
                      </span>
                      <span className="text-neutral-500 text-xs">
                        Organize these photos into an album
                      </span>
                    </div>
                  </label>

                  {addToAlbum && (
                    <div className="pt-2 space-y-3 border-t border-neutral-800">
                      <div>
                        <FieldLabel htmlFor={`${fid}-album-select`}>
                          {selectedAlbumId ? 'Add to Existing Album' : 'Create New Album'}
                        </FieldLabel>
                        <select
                          id={`${fid}-album-select`}
                          value={selectedAlbumId}
                          onChange={e => {
                            setSelectedAlbumId(e.target.value)
                            if (e.target.value) setAlbumName('')
                          }}
                          className={`${fieldClass}`}
                        >
                          <option value="">+ Create new album</option>
                          {albumsLoaded && Array.isArray(albums) && albums.length > 0 && (
                            <optgroup label="Your Albums">
                              {albums.map(album => (
                                <option key={album.id} value={album.id}>{album.name}</option>
                              ))}
                            </optgroup>
                          )}
                        </select>
                      </div>

                      {!selectedAlbumId && (
                        <>
                          <div>
                            <FieldLabel htmlFor={`${fid}-album-name`}>Album name</FieldLabel>
                            <input
                              id={`${fid}-album-name`}
                              type="text"
                              value={albumName}
                              onChange={e => setAlbumName(e.target.value)}
                              placeholder="e.g. Summer 2024, Street Photography…"
                              className={`${fieldClass}`}
                            />
                          </div>
                          <div className="flex items-center justify-between py-2">
                            <div>
                              <span id={`${fid}-album-public`} className="block text-neutral-400 text-xs uppercase tracking-wider">Public Album</span>
                              <span className="text-neutral-500 text-xs">Others can discover and view</span>
                            </div>
                            {/* A switch, said out loud. This decides whether an
                                album is public, and it was a bare button whose
                                entire state was a background color: nothing
                                announced what it was, whether it was on, or
                                that it had changed. The pill is still 40x20;
                                the button around it is 44 tall. */}
                            <button
                              type="button"
                              role="switch"
                              aria-checked={albumPublic}
                              aria-labelledby={`${fid}-album-public`}
                              onClick={() => setAlbumPublic(!albumPublic)}
                              className={`-my-3 -mr-2 grid h-11 flex-shrink-0 place-items-center px-2 ${focusRing}`}
                            >
                              <span
                                className={`relative block h-5 w-10 rounded-full transition-colors ${
                                  albumPublic ? 'bg-brand' : 'bg-neutral-700'
                                }`}
                              >
                                <span
                                  className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${
                                    albumPublic ? 'left-5' : 'left-0.5'
                                  }`}
                                />
                              </span>
                            </button>
                          </div>
                        </>
                      )}

                      {selectedAlbumId && Array.isArray(albums) && albums.length > 0 && (
                        <div className="flex items-center gap-2 text-neutral-500 text-xs">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          <span>Photos will be added to {albums.find(a => a.id === selectedAlbumId)?.name}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Ticked per upload, never remembered. The point is that reading
                  it is unavoidable: it sits between the last field and the
                  button, and Publish stays disabled until it is checked. */}
              <label className="flex items-start gap-3 cursor-pointer group bg-neutral-900 border border-neutral-800 p-4">
                <input
                  type="checkbox"
                  checked={confirmedFilm}
                  onChange={e => setConfirmedFilm(e.target.checked)}
                  className="mt-0.5 w-5 h-5 shrink-0 bg-neutral-800 border-2 border-neutral-700 checked:bg-brand checked:border-brand focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-2 focus:ring-offset-neutral-900 cursor-pointer"
                />
                <span className="text-sm">
                  <span className="block text-white font-semibold group-hover:text-brand transition-colors">
                    These were shot on film
                  </span>
                  <span className="block text-neutral-500 text-xs mt-0.5">
                    {/* The nudity rule is stated here rather than only on the
                        guidelines page: this is the last screen before a photo
                        goes up, and it is the one rule with no warning step. */}
                    Not a phone, not a filter, nothing nude or sexual, and they&rsquo;re mine to
                    post.{' '}
                    <Link
                      href="/guidelines"
                      onClick={e => e.stopPropagation()}
                      className="underline underline-offset-2 hover:text-neutral-300"
                    >
                      The rules
                    </Link>
                  </span>
                </span>
              </label>

              {/* A failed publish used to log to the console and redirect to
                  the home page regardless, so the photos looked published,
                  were not, and were deleted an hour later by the cleanup job.
                  Now it stays put and says what happened. */}
              {publishError && (
                <div
                  role="alert"
                  className="mb-3 border border-brand/40 bg-brand/10 px-4 py-3 text-sm text-[#ff8a80]"
                >
                  {publishError}
                </div>
              )}

              {/* The shared button. This one was hand-rolled with its own
                  height, its own letter-spacing and its own disabled opacity —
                  on the single most important action on the site. */}
              <Button
                onClick={handlePublishClick}
                disabled={publishing || doneCount === 0 || uploadingCount > 0 || !confirmedFilm}
                size="lg"
                fullWidth
              >
                {publishing
                  ? 'Publishing…'
                  : uploadingCount > 0
                    ? `Uploading ${uploadingCount}…`
                    : publishError
                      ? 'Try publishing again'
                      : `Publish ${doneCount} Photo${doneCount !== 1 ? 's' : ''}`}
              </Button>

            </div>
          </div>
        </div>
      </main>
      <Footer />

      {/* New Item Modal */}
      {newItemModal && (
        <NewItemModal
          type={newItemModal.type}
          initialName={newItemModal.initialName}
          onSubmit={handleNewItemSubmit}
          onCancel={() => { setNewItemModal(null); setItemError(null) }}
          loading={creatingItem}
          error={itemError}
          filmStocks={filmStocks}
        />
      )}

      {/* Missing Metadata Warning Modal */}
      {showMissingMetadataModal && (
        <MissingMetadataModal
          missingFields={[
            ...(!bulkMeta.cameraId ? ['camera' as const] : []),
            ...(!bulkMeta.filmStockId ? ['film' as const] : [])
          ]}
          onContinue={() => {
            setShowMissingMetadataModal(false)
            handlePublish()
          }}
          onCancel={() => setShowMissingMetadataModal(false)}
        />
      )}
    </div>
  )
}

// Wrap with Suspense for useSearchParams
export default function UploadPage() {
  return (
    <Suspense fallback={
      <div className="min-h-dvh bg-[#0a0a0a] flex items-center justify-center">
        <div className="text-neutral-500">Loading…</div>
      </div>
    }>
      <UploadPageContent />
    </Suspense>
  )
}
