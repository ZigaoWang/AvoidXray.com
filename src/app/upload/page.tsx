'use client'
import { useState, useCallback, useEffect, useId, useRef, memo, Suspense } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import Combobox from '@/components/Combobox'
import ClientHeader from '@/components/ClientHeader'
import NewItemModal from '@/components/NewItemModal'
import Button, { iconButtonClass } from '@/components/ui/Button'
import { buildNewItemFormData, CREATE_ENDPOINT, type NewItemPayload } from '@/lib/newItemForm'
import { createPreviewUrls, isHeic } from '@/lib/previewImage'
import { formatCaptureDate } from '@/lib/formatDate'
import MissingMetadataModal from '@/components/MissingMetadataModal'
import FieldLabel from '@/components/ui/FieldLabel'
import { checkboxClass, fieldClass } from '@/components/ui/Field'
import type { FilmStockOption } from '@/lib/filmSearch'
import VisibilityToggle, { type VisibilityValue } from '@/components/ui/VisibilityToggle'
import { GUIDELINES } from '@/lib/guidelines'
import { apiErrorMessage } from '@/lib/apiError'
import Link from 'next/link'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import { useToast } from '@/components/ui/Toast'
import { PhotoIcon } from '@/components/ui/EmptyState'
import Badge from '@/components/ui/Badge'
import SelectableTile, { tileCornerClass } from '@/components/SelectableTile'
import DropZone from '@/components/DropZone'
import PageHeader from '@/components/ui/PageHeader'
import { UploadSkeleton, PageSkeleton } from '@/components/ui/Skeleton'
import { IMAGE_FILE_ACCEPT, VALIDATION_LIMITS } from '@/lib/validation'
import Alert from '@/components/ui/Alert'
import { loginHrefHere } from '@/lib/loginHref'
import PageShell from '@/components/PageShell'

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
  locked,
  retryable,
  review,
  onSelect,
  onRemove,
  onRetry,
}: {
  url: string
  index: number
  selected: boolean
  status: UploadStatus
  error: string | null
  hasCustomMeta: boolean
  /** While publishing, when removing a frame would delete its files mid-publish. */
  locked: boolean
  /** A failed upload whose file is still in hand, rather than a failed publish. */
  retryable: boolean
  /**
   * Where this photo is with the nudity check: refused, or sent for an
   * admin's review. Drawn as a short label; the explanation and the choices
   * are under the grid, once for all of them.
   */
  review: 'flagged' | 'requested' | null
  onSelect: (index: number, shiftKey: boolean) => void
  onRemove: (index: number) => void
  onRetry: (index: number) => void
}) {
  return (
    <SelectableTile
      selected={selected}
      onSelect={e => onSelect(index, e.shiftKey)}
      label={`Select photo ${index + 1}`}
      // eslint-disable-next-line @next/next/no-img-element -- a blob URL from the local file, which next/image cannot optimize.
      image={<img src={url} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />}
      corner={
        <button
          type="button"
          onClick={() => onRemove(index)}
          disabled={locked}
          className={`${tileCornerClass} hover:text-brand`}
          aria-label={`Remove photo ${index + 1}`}
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      }
      badges={
        review === 'flagged' ? <Badge tone="warningSolid">Flagged</Badge>
        : review === 'requested' && status === 'done' ? <Badge>In review</Badge>
        : status !== 'error' && review === null && hasCustomMeta ? <Badge>Edited</Badge>
        : undefined
      }
      overlay={
        <>
          {status === 'uploading' && (
            <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-black/70">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
            </div>
          )}
          {status === 'error' && review !== 'flagged' && (
            <div className="absolute inset-x-0 bottom-0 z-10 flex items-end gap-1 bg-red-950/90 px-1.5 py-1 text-[10px] leading-tight text-red-200">
              <span className="min-w-0 flex-1">{error ?? 'Could not upload this photo.'}</span>
              {/* The file is kept, so a dropped connection costs a tap rather
                  than finding that one scan on disk again. */}
              {retryable && !locked && (
                <button
                  type="button"
                  onClick={() => onRetry(index)}
                  className="shrink-0 px-1 py-0.5 font-semibold uppercase tracking-wide text-white underline-offset-2 hover:underline
                             focus-visible:outline focus-visible:outline-1 focus-visible:outline-white"
                  aria-label={`Retry photo ${index + 1}`}
                >
                  Retry
                </button>
              )}
            </div>
          )}
          {/* Color and an icon are the whole of the status otherwise. */}
          <span className="sr-only">
            {status === 'uploading' && 'Uploading'}
            {status === 'done' && 'Uploaded'}
            {status === 'error' && `Could not upload. ${error ?? ''}`}
            {hasCustomMeta && ' Has its own details.'}
          </span>
        </>
      }
    />
  )
})

function UploadPageContent() {
  // Prefix for this form's control ids, so a label points at its own field
  // even when the page renders the form twice.
  const fid = useId()

  const { data: session, status } = useSession()
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
   * Photos the nudity check refused, and those sent for review instead, by
   * preview URL: a key that stays with its tile when others are removed.
   */
  const [flaggedKeys, setFlaggedKeys] = useState<string[]>([])
  const [reviewKeys, setReviewKeys] = useState<string[]>([])
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
  // Each tile's original file, keyed by its preview URL like the slots below,
  // so a failed upload can be sent again. Dropped once the upload lands.
  const filesRef = useRef(new Map<string, File>())
  // Tracked outside state so unmount can revoke them without a stale closure.
  const previewUrlsRef = useRef<string[]>([])
  /**
   * The photos the details panel is editing, by position, in order.
   *
   * One index used to be all there was, so the panel edited either the whole
   * roll or exactly one frame. A roll that changed cameras halfway, or six
   * frames that want the same caption, meant tagging each frame in turn.
   * Empty means the panel edits the roll's defaults.
   */
  const [selection, setSelection] = useState<number[]>([])
  /** The last tile clicked, so a shift-click can take the run from it. */
  const anchorRef = useRef<number | null>(null)
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
  // Asked for a new album with no name, the album step was skipped and the
  // publish still reported success.
  const [albumNameMissing, setAlbumNameMissing] = useState(false)
  const albumNameRef = useRef<HTMLInputElement>(null)
  const [albumPublic, setAlbumPublic] = useState(false)
  const [albums, setAlbums] = useState<Album[]>([])
  const [selectedAlbumId, setSelectedAlbumId] = useState('')
  const [albumsLoaded, setAlbumsLoaded] = useState(false)

  // Target user for "upload as user" feature
  const [targetUser, setTargetUser] = useState<TargetUser | null>(null)
  const [loadingTargetUser, setLoadingTargetUser] = useState(false)

  // Whose grid these photos land in — the account they are attributed to,
  // which on an admin "upload as" is not the person pressing publish.
  const uploaderUsername = targetUser?.username ?? (session?.user as { username?: string })?.username

  // Modal states. `photoIdx` is the tile the panel was showing when the modal
  // opened, so a camera created from one frame's panel tags that frame; null
  // means the panel was on the batch default.
  const [newItemModal, setNewItemModal] = useState<{ type: 'camera' | 'film'; initialName?: string; targets: number[] } | null>(null)
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

  // Asks before a reload or a closed tab throws away a batch that has not been
  // published. Only the browser's own leave prompt can do this; the text it
  // shows is its own.
  const hasUnpublished = previews.length > 0
  useEffect(() => {
    if (!hasUnpublished) return
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (publishedRef.current) return
      event.preventDefault()
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [hasUnpublished])

  /**
   * Asks before an in-app link leaves an unpublished batch.
   *
   * The leave prompt above only covers a reload or a closed tab. A link inside
   * the site navigates without unloading, and leaving the page deletes every
   * draft on it, so a click on the header or the logo threw the roll away
   * without a word. Caught on the document in the capture phase, ahead of the
   * link's own handler.
   */
  const [leavingTo, setLeavingTo] = useState<string | null>(null)
  useEffect(() => {
    if (!hasUnpublished) return
    const onClick = (event: MouseEvent) => {
      if (publishedRef.current || event.defaultPrevented || event.button !== 0) return
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
      const anchor = (event.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null
      if (!anchor || anchor.target === '_blank' || anchor.hasAttribute('download')) return
      const url = new URL(anchor.href)
      if (url.origin !== window.location.origin || url.pathname === window.location.pathname) return
      event.preventDefault()
      event.stopPropagation()
      setLeavingTo(url.pathname + url.search + url.hash)
    }
    document.addEventListener('click', onClick, true)
    return () => document.removeEventListener('click', onClick, true)
  }, [hasUnpublished])

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

  /**
   * The panel the tile grid edits. Below lg it is stacked under the whole
   * left column, so tapping a thumbnail changed a form that was off the
   * bottom of the screen: the tile took a red ring and nothing else moved.
   * Someone who tapped a frame by accident and then scrolled down to type a
   * caption wrote it onto that one frame instead of the roll.
   */
  const metaPanelRef = useRef<HTMLDivElement>(null)

  // Click toggles a frame, shift-click takes the run from the last one
  // clicked. There is no scroll to the panel any more: it brought the form to
  // a phone user after every tap, which made choosing a second frame
  // impossible. The panel's heading says what it is editing instead.
  const toggleSelected = useCallback((idx: number, shiftKey: boolean) => {
    // Read and moved once, outside the updater. React may run an updater
    // twice, and one that moved the anchor itself saw a run of one tile the
    // second time, so shift-click took the two ends and skipped the middle.
    const from = anchorRef.current
    anchorRef.current = idx
    setSelection(prev => {
      const next = new Set(prev)
      if (shiftKey && from !== null && from !== idx) {
        const [lo, hi] = from < idx ? [from, idx] : [idx, from]
        const selecting = !prev.includes(idx)
        for (let i = lo; i <= hi; i++) {
          if (selecting) next.add(i)
          else next.delete(i)
        }
      } else if (next.has(idx)) {
        next.delete(idx)
      } else {
        next.add(idx)
      }
      return [...next].sort((x, y) => x - y)
    })
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
    if (staleUrl) {
      URL.revokeObjectURL(staleUrl)
      filesRef.current.delete(staleUrl)
    }
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

    // The removed frame leaves the selection and everything after it moves
    // up one. Read through the updater so this callback stays stable and
    // PhotoTile's memo holds.
    setSelection(prev => prev.filter(i => i !== idx).map(i => (i > idx ? i - 1 : i)))
    if (anchorRef.current !== null) {
      anchorRef.current = anchorRef.current === idx ? null : anchorRef.current > idx ? anchorRef.current - 1 : anchorRef.current
    }
  }, [])

  // HEIC has no reliable MIME type from a file picker, so it is checked by
  // name as well; isHeic is shared with the preview pipeline.
  const isImageFile = useCallback(
    (file: File): boolean => file.type.startsWith('image/') || isHeic(file),
    []
  )

  /**
   * Sends one file and writes the result to its tile.
   *
   * Removing a tile compacts every array, so the position a file started at
   * is not the position it finishes at. Addressing slots by a captured index
   * landed completions on the wrong tile or past the end: a tile could be
   * left 'uploading' for good, keeping Publish disabled, or worse, publish
   * one photo under another photo's caption, camera and film. The preview
   * URL stays with its tile for as long as the tile exists, so the slot is
   * looked up at write time and a vanished tile is skipped.
   */
  const uploadOne = useCallback(async (file: File, key: string, askForReview = false) => {
    const slotOf = () => previewUrlsRef.current.indexOf(key)
    const fail = (reason: string) => {
      const idx = slotOf()
      if (idx === -1) return
      setUploadStatus(prev => prev.map((s, j) => j === idx ? 'error' : s))
      setUploadErrors(prev => prev.map((e, j) => j === idx ? reason : e))
    }

    // Refused here rather than after the whole file has gone up.
    if (file.size > VALIDATION_LIMITS.MAX_PHOTO_SIZE_MB * 1024 * 1024) {
      fail(`Larger than the ${VALIDATION_LIMITS.MAX_PHOTO_SIZE_MB} MB limit. Try exporting at a lower resolution.`)
      return
    }

    try {
      const formData = new FormData()
      formData.append('files', file)
      // Pass asUserId if uploading as another user
      if (asUserId) {
        formData.append('asUserId', asUserId)
      }
      if (askForReview) formData.append('review', '1')
      const res = await fetch('/api/upload', { method: 'POST', body: formData })
      if (!res.ok) {
        const body = await res.clone().json().catch(() => null) as { failed?: { code?: string }[] } | null
        if (body?.failed?.[0]?.code === 'nudity') {
          setFlaggedKeys(prev => (prev.includes(key) ? prev : [...prev, key]))
        }
        fail(await apiErrorMessage(res, 'Could not upload this photo.'))
        return
      }
      const data = await res.json()
      const photoId: string = data.photos[0].id
      const idx = slotOf()
      if (idx === -1) {
        // removeImage had no id to clean up while this was in flight, so
        // the draft is orphaned on the server unless we say so now.
        fetch('/api/upload/cleanup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids: [photoId] }),
        }).catch(() => {})
        return
      }
      filesRef.current.delete(key)
      photoIdsRef.current[idx] = photoId
      setUploadStatus(prev => prev.map((s, j) => j === idx ? 'done' : s))
    } catch {
      fail('Could not reach the server. Check your connection and try again.')
    }
  }, [asUserId])

  /**
   * The photos the check refused, sent again for an admin to look at. They are
   * stored as held: only the uploader and admins can see them until then.
   */
  const requestReview = useCallback(() => {
    for (const key of flaggedKeys) {
      const idx = previewUrlsRef.current.indexOf(key)
      const file = filesRef.current.get(key)
      if (idx === -1 || !file) continue
      setUploadStatus(prev => prev.map((s, j) => j === idx ? 'uploading' : s))
      setUploadErrors(prev => prev.map((e, j) => j === idx ? null : e))
      uploadOne(file, key, true)
    }
    setReviewKeys(prev => [...prev, ...flaggedKeys])
    setFlaggedKeys([])
  }, [flaggedKeys, uploadOne])

  const flaggedNow = flaggedKeys.filter(key => previews.includes(key))
  const reviewNow = reviewKeys.filter(key => previews.includes(key))

  const removeFlagged = useCallback(() => {
    // Highest first, so each removal leaves the remaining indexes valid.
    const indexes = flaggedKeys
      .map(key => previewUrlsRef.current.indexOf(key))
      .filter(i => i !== -1)
      .sort((x, y) => y - x)
    for (const i of indexes) removeImage(i)
    setFlaggedKeys([])
  }, [flaggedKeys, removeImage])

  const retryUpload = useCallback((idx: number) => {
    const key = previewUrlsRef.current[idx]
    const file = key ? filesRef.current.get(key) : undefined
    if (!key || !file) return
    setUploadStatus(prev => prev.map((s, j) => j === idx ? 'uploading' : s))
    setUploadErrors(prev => prev.map((e, j) => j === idx ? null : e))
    uploadOne(file, key)
  }, [uploadOne])

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
    for (let i = 0; i < files.length; i++) filesRef.current.set(previewUrls[i], files[i])

    // One at a time, so a large drop does not open thirty uploads at once.
    for (let i = 0; i < files.length; i++) await uploadOne(files[i], previewUrls[i])
  }, [uploadOne])

  const handleDrop = useCallback((e: React.DragEvent) => {
    // Files added mid-publish were left out of it and never cleaned up.
    if (publishing) return
    uploadFiles(Array.from(e.dataTransfer.files).filter(isImageFile))
  }, [uploadFiles, isImageFile, publishing])

  // Handle new item modal submission — create immediately via API
  const handleNewItemSubmit = async (data: NewItemPayload) => {
    if (!newItemModal) return
    const { type, targets } = newItemModal

    // The created item belongs wherever the panel that opened the modal was
    // writing. This always wrote to bulkMeta, so adding a camera while one
    // frame was selected quietly retagged the whole roll.
    const applyMeta = (patch: Partial<PhotoMeta>) => {
      if (targets.length === 0) setBulkMeta(prev => ({ ...prev, ...patch }))
      else setIndividualMeta(prev => prev.map((m, i) => (targets.includes(i) ? { ...m, ...patch } : m)))
    }

    setCreatingItem(true)
    setItemError(null)

    try {
      const formData = buildNewItemFormData(data)

      if (type === 'camera') {
        const res = await fetch(CREATE_ENDPOINT.camera, { method: 'POST', body: formData })
        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          throw new Error(err.error || 'Could not add that camera')
        }
        const camera = await res.json()
        setCameras(prev => [...prev, camera])
        applyMeta({
          cameraId: camera.id,
          ...(camera.defaultFilmStockId && { filmStockId: camera.defaultFilmStockId })
        })
      } else {
        const res = await fetch(CREATE_ENDPOINT.film, { method: 'POST', body: formData })
        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          throw new Error(err.error || 'Could not add that film stock')
        }
        const filmStock = await res.json()
        setFilmStocks(prev => [...prev, filmStock])
        applyMeta({ filmStockId: filmStock.id })
      }

      setNewItemModal(null)
      setItemError(null)
    } catch (err) {
      setItemError(err instanceof Error ? err.message : 'Could not add that')
    } finally {
      setCreatingItem(false)
    }
  }

  /**
   * How many photos will publish with no camera, and how many with no film
   * stock — counted the way handlePublish resolves them, per photo, falling
   * back to the batch default.
   *
   * It used to read `bulkMeta` alone, which got both directions wrong. Anyone
   * who shot two cameras on one trip and tagged each frame individually —
   * which is what the per-photo panel is for — was told they had not picked a
   * camera, and the only way past was a link reading "I'm not sure". The
   * reverse was silent: clear the camera on one frame of a tagged batch and
   * nothing was said about the one photo that really had none.
   */
  const missingMetadata = () => {
    const publishing = photoIdsRef.current
      .map((id, i) => (id && uploadStatus[i] === 'done' ? i : -1))
      .filter(i => i >= 0)
    return {
      total: publishing.length,
      camera: publishing.filter(i => !(individualMeta[i]?.cameraId || bulkMeta.cameraId)).length,
      film: publishing.filter(i => !(individualMeta[i]?.filmStockId || bulkMeta.filmStockId)).length,
    }
  }

  // Check for missing metadata before publishing
  const handlePublishClick = () => {
    // The button is disabled without this, but the guard means a keyboard or
    // programmatic path cannot walk around the confirmation either.
    if (!confirmedFilm) return
    if (!asUserId && addToAlbum && !selectedAlbumId && !albumName.trim()) {
      setAlbumNameMissing(true)
      albumNameRef.current?.focus()
      return
    }
    const missing = missingMetadata()

    if (missing.camera > 0 || missing.film > 0) {
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
        failures.push({ index: i, reason: 'Could not reach the server. Check your connection and try again.' })
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
    /**
     * Where the upload lands.
     *
     * It used to be `/`, which is the one page that can never show what was
     * just published: a private batch is not on it at all, and even a public
     * one arrives with no confirmation that anything happened. The album when
     * the photos went into one, otherwise the photographer's own grid — their
     * own feed shows their private frames, and /albums/create already lands on
     * the thing it made.
     */
    let destination = uploaderUsername ? `/${uploaderUsername}` : '/'

    if (!asUserId && addToAlbum && (albumName.trim() || selectedAlbumId)) {
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
          if (albumRes.ok) destination = `/albums/${selectedAlbumId}`
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
          if (albumRes.ok) {
            // Safe to consume the body here: the failure path below only
            // reads it when the response was not ok.
            const created = await albumRes.json().catch(() => null)
            if (created?.id) destination = `/albums/${created.id}`
          }
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
    // Photos sent for review are published but not public, so they are not
    // counted as if they were.
    const waiting = reviewKeys.filter(key => previewUrlsRef.current.includes(key)).length
    const live = photosToPublish - waiting
    toast(
      waiting === 0
        ? `${photosToPublish} ${photosToPublish === 1 ? 'photo' : 'photos'} published`
        : live > 0
          ? `${live} ${live === 1 ? 'photo' : 'photos'} published, ${waiting} waiting for review`
          : `Sent for review. You will get a notification when an admin decides.`,
      'success'
    )
    router.push(destination)
  }

  // Redirecting from the render body is a side effect during render, which
  // React is free to run more than once or discard; an effect is where a
  // navigation belongs. The page's shape meanwhile, rather than the
  // signed-out form or a blank screen.
  useEffect(() => {
    if (status === 'unauthenticated') router.replace(loginHrefHere())
  }, [status, router])

  const loadingPage = (
    <PageSkeleton header={<ClientHeader />}><UploadSkeleton /></PageSkeleton>
  )

  if (status === 'loading' || status === 'unauthenticated') return loadingPage

  const doneCount = uploadStatus.filter(s => s === 'done').length
  const uploadingCount = uploadStatus.filter(s => s === 'uploading').length
  const isIndividual = selection.length > 0

  /**
   * What the panel shows for each field: the value every selected frame
   * shares, or nothing when they differ. `mixed` says which fields differ, so
   * an empty field can tell "these disagree" apart from "none is set".
   */
  const fields = ['caption', 'cameraId', 'filmStockId', 'takenDate', 'visibility'] as const
  const mixed = new Set<string>()
  const currentMeta: PhotoMeta = isIndividual
    ? (Object.fromEntries(fields.map(f => {
        const values = new Set(selection.map(i => individualMeta[i]?.[f] ?? ''))
        if (values.size > 1) mixed.add(f)
        return [f, values.size === 1 ? [...values][0] : '']
      })) as PhotoMeta)
    : bulkMeta

  // Only the field that changed is written, so setting a camera on six frames
  // that each carry their own caption leaves the captions alone.
  const updateMeta = (patch: Partial<PhotoMeta>) => {
    if (!isIndividual) {
      setBulkMeta(prev => ({ ...prev, ...patch }))
      return
    }
    const chosen = new Set(selection)
    setIndividualMeta(prev => prev.map((m, i) => (chosen.has(i) ? { ...m, ...patch } : m)))
  }

  const placeholderFor = (field: keyof PhotoMeta, fallback: string, inherited: string) =>
    mixed.has(field) ? 'Mixed' : isIndividual && inherited ? 'Using default' : fallback

  // Still finding the account an admin is uploading for.
  if (asUserId && loadingTargetUser) return loadingPage

  return (
    <PageShell header={<ClientHeader />}>
      <main id="main-content" tabIndex={-1} className="flex-1 max-w-5xl mx-auto w-full py-12 px-6">
        {/* Admin Upload As User Banner */}
        {targetUser && (
          <div className="mb-6 p-4 bg-yellow-500/10 border border-yellow-500/30 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <svg className="w-5 h-5 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <div>
                <p className="text-yellow-500 font-medium">Uploading as another user</p>
                <p className="text-yellow-500/70 text-sm">
                  Photos will be attributed to <span className="font-bold">@{targetUser.username}</span>
                  {targetUser.name && <span> ({targetUser.name})</span>}
                </p>
              </div>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={() => router.push('/admin')}>
              Cancel
            </Button>
          </div>
        )}

        <PageHeader
          title={targetUser ? `Upload for @${targetUser.username}` : 'Upload photos'}
          description="Each photo starts uploading as soon as you add it."
        />

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
            <DropZone onDrop={handleDrop}>
              <input type="file" multiple accept={IMAGE_FILE_ACCEPT} disabled={publishing} onChange={e => { uploadFiles(Array.from(e.target.files || []).filter(isImageFile)); e.target.value = '' }} className="sr-only" id="file-input" />
              <label htmlFor="file-input" className="cursor-pointer block">
                <div className="text-neutral-400 mb-2">
                  <div className="mx-auto mb-3 flex justify-center opacity-50">
                    <PhotoIcon size={10} />
                  </div>
                  Drop images here or click to browse
                </div>
                <p className="text-neutral-500 text-xs">JPG, PNG, TIFF or HEIC</p>
              </label>
            </DropZone>

            {/* Dismissible: after the first read it is noise, and the line
                under the publish button keeps the rules one click away. Held
                in localStorage so it stays gone. */}
            {rulesVisible && (
              <div className="border border-neutral-800 p-5">
                <div className="flex items-start justify-between gap-4 mb-4">
                  <div>
                    <h2 className="text-white font-bold">Before you upload</h2>
                    <p className="text-sm text-neutral-500">
                      Tag each photo with its film stock and camera so people can find it.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={dismissRules}
                    // The shared close button: a 24px glyph box was under
                    // the minimum target, with no focus ring.
                    className={`${iconButtonClass} -mt-3 -mr-3 shrink-0`}
                    aria-label="Dismiss"
                  >
                    <svg className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden>
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
                {/* A new tab, so reading the rules does not leave the roll. */}
                <Link
                  href="/guidelines"
                  target="_blank"
                  className="inline-block mt-4 text-sm text-neutral-500 hover:text-white underline underline-offset-2"
                >
                  Read the guidelines
                </Link>
              </div>
            )}

            {previews.length > 0 && (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                  <span className="text-neutral-400" role="status" aria-live="polite">
                    {uploadingCount > 0
                      ? `${uploadingCount} of ${previews.length} uploading…`
                      : `${doneCount} of ${previews.length} ready`}
                  </span>
                  <span className="hidden text-xs text-neutral-500 sm:inline">
                    Click to select, shift-click for a run
                  </span>
                  <div className="ml-auto flex gap-1">
                    {selection.length > 0 && (
                      <Button variant="ghost" size="sm" onClick={() => setSelection([])}>
                        Clear
                      </Button>
                    )}
                    {selection.length < previews.length && (
                      <Button variant="ghost" size="sm" onClick={() => setSelection(previews.map((_, i) => i))}>
                        Select all
                      </Button>
                    )}
                  </div>
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
                      selected={selection.includes(i)}
                      status={publishErrors[i] ? 'error' : uploadStatus[i]}
                      error={publishErrors[i] ?? uploadErrors[i] ?? null}
                      hasCustomMeta={Boolean(
                        individualMeta[i]?.caption ||
                        individualMeta[i]?.cameraId ||
                        individualMeta[i]?.filmStockId ||
                        individualMeta[i]?.takenDate ||
                        // '' is "inherit the batch default", so only a real
                        // override counts. Without this a frame set to Private
                        // looked identical to the rest of the roll.
                        individualMeta[i]?.visibility
                      )}
                      locked={publishing}
                      retryable={uploadStatus[i] === 'error' && !publishErrors[i]}
                      review={flaggedKeys.includes(url) ? 'flagged' : reviewKeys.includes(url) ? 'requested' : null}
                      onSelect={toggleSelected}
                      onRemove={removeImage}
                      onRetry={retryUpload}
                    />
                  ))}
                </div>

                {/* What happens to photos sent for review, which otherwise
                    look finished once they upload. Publishing is still the
                    step that sets their camera, film and caption. */}
                {reviewNow.length > 0 && flaggedNow.length === 0 && (
                  <div role="status" className="mt-4 border border-neutral-800 bg-neutral-900 p-4">
                    <p className="text-sm text-white">
                      {reviewNow.length === 1 ? 'Sent for review.' : `${reviewNow.length} photos sent for review.`}
                    </p>
                    <p className="mt-1 text-sm text-neutral-400">
                      Publish {reviewNow.length === 1 ? 'it' : 'them'} with the rest. {reviewNow.length === 1 ? 'It goes' : 'They go'} public
                      once an admin approves, and you will get a notification either way.
                    </p>
                  </div>
                )}

                {/* Once for every flagged photo, rather than a sentence
                    squeezed into each thumbnail. */}
                {flaggedNow.length > 0 && (
                  <div role="status" className="mt-4 border border-neutral-800 bg-neutral-900 p-4">
                    <p className="text-sm text-white">
                      {flaggedNow.length === 1
                        ? 'One photo looks like it contains nudity, so it was not uploaded.'
                        : `${flaggedNow.length} photos look like they contain nudity, so they were not uploaded.`}
                    </p>
                    <p className="mt-1 text-sm text-neutral-400">
                      The guidelines do not allow nudity. If the check got it wrong, ask for a review: an admin will look,
                      and only you can see {flaggedNow.length === 1 ? 'it' : 'them'} until then.
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button size="sm" variant="secondary" disabled={publishing} onClick={requestReview}>
                        Ask for a review
                      </Button>
                      <Button size="sm" variant="ghost" disabled={publishing} onClick={removeFlagged}>
                        Remove {flaggedNow.length === 1 ? 'it' : 'them'}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Right: Metadata */}
          <div className="lg:col-span-2 scroll-mt-4" ref={metaPanelRef}>
            {previews.length === 0 ? (
              /* The form asked you to describe photographs that did not exist
                 yet — a caption, a camera and a film stock for nothing, under
                 a 48px "Publish 0 Photos". The drop zone is the first step, so
                 it is the only thing the page asks for until it is done. */
              <div className="border border-dashed border-neutral-800 p-5">
                <h2 className="text-white font-semibold">Nothing to describe yet</h2>
                <p className="text-neutral-500 text-sm mt-1 leading-relaxed">
                  Drop your scans on the left. The caption, camera and film stock for the roll are
                  asked for here, and you can override any of them one frame at a time.
                </p>
              </div>
            ) : (
            <div className="bg-neutral-900/50 border border-neutral-800 p-5 space-y-5">
              <div className="border-b border-neutral-800 pb-4">
                <div className="flex items-start justify-between gap-3">
                  <h2 className="text-white font-semibold">
                    {selection.length === 0
                      ? 'All photos'
                      : selection.length === 1
                        ? `Photo ${selection[0] + 1}`
                        : `${selection.length} photos selected`}
                  </h2>
                  {/* It used to live in the grid's header instead, which
                      below lg is a scroll above the panel it backs out of: the
                      panel said "Photo 4" and the way out was off screen. One
                      control, attached to the thing it exits.

                      Ghost, because it only backs out of one frame's panel. As
                      a primary it was the same brand-red fill as Publish, so
                      the screen had two loudest things and the quieter of the
                      two was the one that commits the whole roll. */}
                  {isIndividual && (
                    <Button variant="ghost" size="sm" className="-my-1 shrink-0" onClick={() => setSelection([])}>
                      ← All photos
                    </Button>
                  )}
                </div>
                <p className="text-neutral-500 text-xs mt-1">
                  {isIndividual
                    ? `Changes apply to ${selection.length === 1 ? 'this photo' : 'these photos'} only. A blank field uses the default.`
                    : 'Applies to every photo. Select photos to give them their own details.'}
                </p>
              </div>

              <div>
                <FieldLabel htmlFor={`${fid}-caption`}>Caption</FieldLabel>
                <input
                  id={`${fid}-caption`}
                  type="text"
                  value={currentMeta.caption}
                  onChange={e => updateMeta({ caption: e.target.value })}
                  placeholder={mixed.has('caption') ? 'Mixed' : isIndividual ? bulkMeta.caption || 'No default caption' : 'Add a caption'}
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
                    mixed.has('takenDate')
                      ? '(mixed)'
                      : isIndividual
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
                  onChange={e => updateMeta({ takenDate: e.target.value })}
                  className={`${fieldClass}`}
                />
              </div>

              <div className="space-y-4">
                <Combobox
                  options={cameras}
                  value={currentMeta.cameraId}
                  onChange={id => {
                    const cam = cameras.find(c => c.id === id)
                    updateMeta({
                      cameraId: id,
                      ...(cam?.defaultFilmStockId && { filmStockId: cam.defaultFilmStockId })
                    })
                  }}
                  placeholder={placeholderFor('cameraId', 'Select…', bulkMeta.cameraId)}
                  label="Camera"
                  onAddNewClick={typed => setNewItemModal({ type: 'camera', initialName: typed, targets: selection })}
                />
                <Combobox
                  options={filmStocks}
                  value={currentMeta.filmStockId}
                  onChange={id => updateMeta({ filmStockId: id })}
                  placeholder={placeholderFor('filmStockId', 'Select…', bulkMeta.filmStockId)}
                  label="Film stock"
                  onAddNewClick={typed => setNewItemModal({ type: 'film', initialName: typed, targets: selection })}
                />

                {/* Decided before publishing rather than after, so a photo
                    never goes public on its way to being made private. Per
                    photo it can fall back to the batch default. */}
                <VisibilityToggle
                  value={currentMeta.visibility}
                  onChange={v => updateMeta({ visibility: v })}
                  allowInherit={isIndividual}
                  inheritedValue={bulkMeta.visibility === 'PRIVATE' ? 'PRIVATE' : 'PUBLIC'}
                  label={selection.length === 1 ? 'Who can see this photo' : 'Who can see these photos'}
                />
              </div>

              {/* Not offered when uploading as someone else. The album request
                  is made as the admin, and an album only takes its creator's
                  photos, so it failed every time after the photos published. */}
              {!asUserId && (
                <div className="border-t border-neutral-800 pt-5">
                  <div className="bg-neutral-900 border border-neutral-800 p-4 space-y-3">
                    <label className="flex items-center gap-3 cursor-pointer group">
                      <input
                        type="checkbox"
                        checked={addToAlbum}
                        onChange={e => setAddToAlbum(e.target.checked)}
                        className={checkboxClass}
                      />
                      <div className="flex-1">
                        <span className="text-white font-semibold text-sm block group-hover:text-brand transition-colors">
                          Add to an album
                        </span>
                        <span className="text-neutral-500 text-xs">
                          Put these photos in a new or existing album
                        </span>
                      </div>
                    </label>

                    {addToAlbum && (
                      <div className="pt-2 space-y-3 border-t border-neutral-800">
                        <div>
                          <FieldLabel htmlFor={`${fid}-album-select`}>
                            Album
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
                              <optgroup label="Your albums">
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
                                ref={albumNameRef}
                                id={`${fid}-album-name`}
                                type="text"
                                value={albumName}
                                onChange={e => { setAlbumName(e.target.value); setAlbumNameMissing(false) }}
                                placeholder="e.g. Lisbon, or street portraits"
                                aria-invalid={albumNameMissing || undefined}
                                aria-describedby={albumNameMissing ? `${fid}-album-name-error` : undefined}
                                className={`${fieldClass}`}
                              />
                              {albumNameMissing && (
                                <p id={`${fid}-album-name-error`} role="alert" className="mt-1.5 text-xs text-brand-light">
                                  Name the album, or uncheck Add to an album.
                                </p>
                              )}
                            </div>
                            {/* The same control and the same sentence as
                                /albums/create and the add-to-album dialog. This
                                was a bespoke pill switch asking "Public Album"
                                in its own words, so the one question got a
                                different answer shape depending on where you
                                happened to create the album. */}
                            <VisibilityToggle
                              value={albumPublic ? 'PUBLIC' : 'PRIVATE'}
                              onChange={next => setAlbumPublic(next === 'PUBLIC')}
                              label="Who can see this album"
                              hint={albumPublic ? 'Anyone can find this album on AvoidXray.' : 'Only you can see this album.'}
                            />
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
              )}

              {/* Ticked per upload, never remembered. The point is that reading
                  it is unavoidable: it sits between the last field and the
                  button, and Publish stays disabled until it is checked. */}
              <label className="flex items-start gap-3 cursor-pointer group bg-neutral-900 border border-neutral-800 p-4">
                <input
                  type="checkbox"
                  checked={confirmedFilm}
                  onChange={e => setConfirmedFilm(e.target.checked)}
                  className={`mt-0.5 ${checkboxClass}`}
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
                      target="_blank"
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
                <Alert className="mb-3">{publishError}</Alert>
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
                      : `Publish ${doneCount} photo${doneCount !== 1 ? 's' : ''}`}
              </Button>

            </div>
            )}
          </div>
        </div>
      </main>
      <ConfirmDialog
        open={leavingTo !== null}
        title="Leave without publishing?"
        confirmLabel="Leave"
        onConfirm={() => { if (leavingTo) router.push(leavingTo) }}
        onClose={() => setLeavingTo(null)}
      >
        The photos on this page have not been published. Leaving removes them and the details you added.
      </ConfirmDialog>

      {/* New Item Modal */}
      {newItemModal && (
        <NewItemModal
          type={newItemModal.type}
          initialName={newItemModal.initialName}
          onSubmit={handleNewItemSubmit}
          onCancel={() => { setNewItemModal(null); setItemError(null) }}
          loading={creatingItem}
          error={itemError}
        />
      )}

      {/* Missing Metadata Warning Modal */}
      {showMissingMetadataModal && (
        <MissingMetadataModal
          missing={missingMetadata()}
          onContinue={() => {
            setShowMissingMetadataModal(false)
            handlePublish()
          }}
          onCancel={() => setShowMissingMetadataModal(false)}
        />
      )}
    </PageShell>
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
