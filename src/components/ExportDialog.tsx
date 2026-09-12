'use client'
import { useState, useEffect, useId, useRef, useCallback, useMemo } from 'react'
import FieldLabel, { FieldCaption } from '@/components/ui/FieldLabel'
import { fieldClass } from '@/components/ui/Field'
import Button, { iconButtonClass } from '@/components/ui/Button'
import { useDialogBehavior } from '@/components/ui/dialog'
import { focusRing } from '@/components/ui/focus'
import {
  CAPTION_MAX_LENGTH,
  LOOKS,
  STYLE_PRINTS,
  availableResolutions,
  canTurn,
  lookById,
  nativeFormat,
  type ExportFormat,
  type ExportTheme,
  type LookId,
  type Resolution,
} from '@/lib/exportFormats'

/**
 * One photograph as far as this dialog is concerned.
 *
 * A list of these rather than a single id, because a roll is the unit people
 * think in and batch export is the next thing to be built on this. Retrofitting
 * a list into a component written around a scalar means rewriting it; taking
 * the list now costs nothing, and one photograph is simply the case where the
 * list has one entry.
 */
export interface ExportPhoto {
  id: string
  width: number
  height: number
  camera?: string | null
  filmStock?: string | null
  takenDate?: string | null
  /** The photograph's own caption, which is what a set of them has instead of one shared line. */
  caption?: string | null
  /** The film's format, so the export can open at the ratio it was shot at. */
  filmFormat?: string | null
  /** Used for the strip when there is more than one. */
  thumbnailPath?: string | null
}

interface ExportDialogProps {
  photos: ExportPhoto[]
  onClose: () => void
}

/**
 * The ratios worth offering, named for what they are rather than for a number.
 *
 * A photographer does not think in "4:5". They think about where it is going —
 * the feed, a story, a 4x6 from the lab — or about what the frame already is.
 * So each one carries both: the thing it is for, and the ratio underneath.
 */
const FORMATS: { id: ExportFormat; name: string; note: string; ratio: string }[] = [
  { id: 'original', name: 'As shot', note: 'Own', ratio: '3 / 2' },
  { id: 'frame', name: 'Frame', note: '3:2 · 4×6', ratio: '2 / 3' },
  { id: 'classic', name: 'Classic', note: '4:3 · 645', ratio: '3 / 4' },
  { id: 'post', name: 'Post', note: '4:5 · 8×10', ratio: '4 / 5' },
  { id: 'square', name: 'Square', note: '1:1 · 6×6', ratio: '1 / 1' },
  { id: 'story', name: 'Story', note: '9:16', ratio: '9 / 16' },
]

const RESOLUTIONS: { id: Resolution; name: string; note: string }[] = [
  { id: 'web', name: 'Web', note: 'Posting' },
  { id: 'high', name: 'High', note: 'Keeping' },
  { id: 'max', name: 'Max', note: 'Printing' },
]

/** The shape a format will actually come out as, for the button's swatch. */
function swatchRatio(f: (typeof FORMATS)[number], landscape: boolean, srcW: number, srcH: number): string {
  if (f.id === 'original') return `${srcW} / ${srcH}`
  if (!canTurn(f.id) || !landscape) return f.ratio
  const [w, h] = f.ratio.split('/').map(part => part.trim())
  return `${h} / ${w}`
}

/**
 * Holds a value back until the caller stops changing it.
 *
 * The caption and date are free text, and every keystroke used to trigger a
 * full server-side render — fetching the original from storage and
 * recompositing it — so typing a short caption cost a dozen of them.
 */
function useDebounced<T>(value: T, delayMs: number): T {
  const [settled, setSettled] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delayMs)
    return () => clearTimeout(timer)
  }, [value, delayMs])
  return settled
}

/** Long enough to cover ordinary typing, short enough to feel immediate. */
const TYPING_SETTLE_MS = 400

/** Where the last look is kept, so twelve decisions are not re-made per photo. */
const REMEMBERED_LOOK = 'avoidxray:export:look'

/** The message a failed render should show, preferring the server's own. */
async function describeFailure(response: Response): Promise<string> {
  const data = await response.json().catch(() => null)
  const message = typeof data?.error === 'string'
    ? data.error
    : 'Could not generate the export. Please try again.'
  // The server says how long a rate limit has to run; saying "a moment" when it
  // knows the number is the kind of small dishonesty that makes people retry.
  const after = Number(data?.retryAfter)
  return after > 0 ? `${message} (about ${after}s)` : message
}

/** "web=1080x1350,high=2160x2700" as the route reports it. */
function parseSizes(header: string | null): Record<string, { w: number; h: number }> {
  const sizes: Record<string, { w: number; h: number }> = {}
  for (const entry of (header || '').split(',')) {
    const [name, box] = entry.split('=')
    const [w, h] = (box || '').split('x').map(Number)
    if (name && w > 0 && h > 0) sizes[name] = { w, h }
  }
  return sizes
}

/**
 * A group heading. neutral-400 rather than neutral-500, which is 3.78:1 on this
 * panel — under AA, and carried by every line that tells the controls apart:
 * the headings, the look notes, the ratio notes and the pixel readout. The text
 * explaining the panel was the least legible text in it.
 */
const sectionLabel = 'text-neutral-400 text-xs uppercase tracking-wider mb-3'

export default function ExportDialog({ photos, onClose }: ExportDialogProps) {
  const [downloading, setDownloading] = useState(false)

  /**
   * Dismissal, refused while a file is being made.
   *
   * The backdrop, the close button and Escape all dismissed the dialog in the
   * middle of a Max render, which leaves a render slot occupied and throws away
   * a file the viewer explicitly asked for and is waiting on. Modal has carried
   * exactly this gate, and the reasoning for it, since it was written; this
   * panel needs its own layout and so re-implemented the shell without it.
   */
  const requestClose = () => { if (!downloading) onClose() }

  const panelRef = useDialogBehavior({ open: true, onClose: requestClose })
  const fid = useId()

  /**
   * Where the pointer went down, so a drag that ends on the backdrop does not
   * count as clicking it.
   *
   * A click is dispatched on the nearest common ancestor of the press and the
   * release, so pressing a Look button or drag-selecting the caption and
   * letting go past the panel edge dispatched the click on the backdrop and
   * discarded every setting. The panel is max-w-4xl on a wide screen; there is
   * a great deal of backdrop to let go over.
   */
  const pressedOnBackdrop = useRef(false)

  const [index, setIndex] = useState(0)
  const photo = photos[Math.min(index, photos.length - 1)]
  const many = photos.length > 1

  // The look decides where everything starts. Remembered across photographs,
  // because picking the same one every time is the tax that makes people export
  // a single frame and stop.
  // Read before the first render rather than in an effect after it. Restoring
  // it afterwards left `format` already initialised against the default look,
  // so Filmstrip came back paired with the wrong size and the Size row
  // highlighted that wrong size as though it had been chosen — and the first
  // preview was rendered and thrown away.
  const [lookId, setLookId] = useState<LookId>(() => {
    if (typeof window === 'undefined') return 'print'
    const saved = window.localStorage.getItem(REMEMBERED_LOOK)
    return saved && LOOKS.some(l => l.id === saved) ? (saved as LookId) : 'print'
  })

  const look = lookById(lookId)
  const prints = STYLE_PRINTS[look.style]

  const [format, setFormat] = useState<ExportFormat>(look.format ?? nativeFormat(photo.filmFormat, photo.width, photo.height))
  const [landscape, setLandscape] = useState(photo.width > photo.height)
  const [resolution, setResolution] = useState<Resolution>('web')
  const [adjusting, setAdjusting] = useState(false)

  // Overrides on top of the look. Null means "whatever the look says", so
  // switching looks moves them unless they have been deliberately set.
  const [paper, setPaper] = useState<ExportTheme | null>(null)
  const [mat, setMat] = useState<number | null>(null)
  const theme = paper ?? look.theme
  const matWidth = mat ?? look.mat ?? 55

  const [showCamera, setShowCamera] = useState(true)
  const [showFilm, setShowFilm] = useState(true)
  const [showUsername, setShowUsername] = useState(true)
  const [showDate, setShowDate] = useState(!!photo.takenDate)
  const [showQR, setShowQR] = useState(false)
  const [showCaption, setShowCaption] = useState(true)

  const [customDate, setCustomDate] = useState('')
  const [customCaption, setCustomCaption] = useState('')

  // Each photograph's own caption and date, not one line shared across a set.
  // A caption means nothing applied to thirty-six different pictures.
  useEffect(() => {
    setCustomCaption(photo.caption?.slice(0, CAPTION_MAX_LENGTH) ?? '')
    setCustomDate(photo.takenDate ? new Date(photo.takenDate).toISOString().split('T')[0] : '')
    setShowDate(!!photo.takenDate)
  }, [photo.id, photo.caption, photo.takenDate])

  const chooseLook = (id: LookId) => {
    setLookId(id)
    window.localStorage.setItem(REMEMBERED_LOOK, id)
    // Only a look that insists on a shape moves the size. Print, Darkroom and
    // Bare leave it where it is: they are prints of the frame, and comparing
    // them is the whole point of having them side by side. Resetting the paper
    // and the mat on every press also erased deliberate choices — and Print and
    // Darkroom are one renderer with two papers, so pressing between them to
    // compare was undoing the comparison.
    const wanted = lookById(id).format
    if (wanted) setFormat(wanted)
  }

  const offered = useMemo(
    () => availableResolutions(format, photo.width, photo.height),
    [format, photo.width, photo.height]
  )
  const chosen: Resolution = offered.includes(resolution) ? resolution : offered[offered.length - 1]
  const turnable = canTurn(format)

  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [loadingPreview, setLoadingPreview] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [exportSizes, setExportSizes] = useState<Record<string, { w: number; h: number }>>({})
  const exportSize = exportSizes[chosen] ?? null
  const previewUrlRef = useRef<string | null>(null)

  const settledCaption = useDebounced(customCaption, TYPING_SETTLE_MS)
  const settledDate = useDebounced(customDate, TYPING_SETTLE_MS)
  // The mat is a slider, which is the worst case of all: it emits a value for
  // every pixel dragged and for every arrow key held. Undebounced it fired a
  // full server render per step and could spend the whole 40-per-5-minute
  // allowance in about a second of dragging.
  const settledMat = useDebounced(matWidth, TYPING_SETTLE_MS)

  /** Everything that decides the picture. The resolution is not one of them. */
  const picture = useCallback(
    (caption: string, date: string, photographSize: number) => {
      const params = new URLSearchParams({
        id: photo.id,
        style: look.style,
        format,
        theme,
        landscape: turnable && landscape ? '1' : '0',
        mat: String(photographSize),
        showCamera: showCamera ? '1' : '0',
        showFilm: showFilm ? '1' : '0',
        showUsername: showUsername ? '1' : '0',
        showDate: showDate ? '1' : '0',
        showQR: showQR ? '1' : '0',
        showCaption: showCaption ? '1' : '0',
      })
      if (showCaption) params.set('caption', caption)
      if (date) params.set('customDate', date)
      return params
    },
    [photo.id, look.style, format, theme, turnable, landscape,
     showCamera, showFilm, showUsername, showDate, showQR, showCaption]
  )

  /**
   * The preview's address, which deliberately does not mention the resolution.
   *
   * A preview is drawn at web scale whatever size is chosen, so including it
   * made every resolution click re-fetch pixels that could not differ — a render
   * slot and a rate-limit hit each time, for nothing. The sizes for all three
   * come back from the one render instead, so the control is now instant.
   */
  const previewQuery = useMemo(
    () => `${picture(settledCaption, settledDate, settledMat)}&preview=1`,
    [picture, settledCaption, settledDate, settledMat]
  )

  useEffect(() => {
    const controller = new AbortController()
    setLoadingPreview(true)

    const failed = () => {
      setExportSizes({})
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
      previewUrlRef.current = null
      setPreviewUrl(null)
    }

    const load = async () => {
      try {
        const response = await fetch(`/api/watermark?${previewQuery}`, { signal: controller.signal })
        if (!response.ok) {
          setError(await describeFailure(response))
          // The picture goes with the numbers. Leaving the previous export at
          // full opacity, with its spinner gone, reads as the result of the
          // click that just failed.
          failed()
          return
        }
        setExportSizes(parseSizes(response.headers.get('X-Export-Sizes')))

        const url = URL.createObjectURL(await response.blob())
        if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
        previewUrlRef.current = url
        setPreviewUrl(url)
        setError(null)
      } catch {
        if (controller.signal.aborted) return
        failed()
        setError('Could not reach the server. Check your connection and try again.')
      } finally {
        if (!controller.signal.aborted) setLoadingPreview(false)
      }
    }

    load()
    return () => controller.abort()
  }, [previewQuery])

  useEffect(() => () => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
  }, [])

  /** The file, named for what it is rather than for a cuid. */
  /** Everything the file depends on, so a held one can be checked against it. */
  const settingsKey = `${picture(customCaption, customDate, matWidth)}&resolution=${chosen}`

  const filename = () => {
    const parts = [photo.filmStock, photo.camera, look.name]
      .filter(Boolean)
      .map(part => String(part).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''))
    return `avoidxray-${parts.join('-') || photo.id}.jpg`
  }

  const render = async () => {
    const response = await fetch(`/api/watermark?${settingsKey}`)
    if (!response.ok) throw new Error(await describeFailure(response))
    return response.blob()
  }

  const handleDownload = async () => {
    setDownloading(true)
    setError(null)
    let url: string | null = null
    try {
      url = URL.createObjectURL(await render())
      const link = document.createElement('a')
      link.href = url
      link.download = filename()
      link.click()
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not generate the export.')
    } finally {
      if (url) URL.revokeObjectURL(url)
      setDownloading(false)
    }
  }

  /**
   * Hand the file to the phone's own share sheet.
   *
   * The only delivery before this was a synthetic anchor, which on iOS puts the
   * file in Files — somewhere the Instagram composer cannot reach. This is the
   * step that was missing between making an export and posting one.
   *
   * Two taps rather than one: the Web Share spec requires transient activation
   * and WebKit expires it after five seconds, so rendering first and sharing
   * inside the same gesture fails on a slow connection. The render is its own
   * tap; sharing the result is the next.
   */
  // The file, and the settings it was made from. Without the key, tapping
  // Share, changing the look while it rendered and tapping "Share now" posted
  // the old look — the effect that was supposed to invalidate it ran at the
  // moment the option changed, when there was no file yet, and never again.
  const [shareable, setShareable] = useState<{ file: File; key: string } | null>(null)
  const canShare = typeof navigator !== 'undefined' && !!navigator.canShare

  const handleShare = async () => {
    if (shareable?.key === settingsKey) {
      try {
        await navigator.share({ files: [shareable.file] })
        // Cleared after it goes, or the button reads "Share now" for the rest
        // of the session, pinned to one file.
        setShareable(null)
      } catch {
        // A dismissed share sheet is not a failure worth reporting.
      }
      return
    }
    setDownloading(true)
    setError(null)
    try {
      const file = new File([await render()], filename(), { type: 'image/jpeg' })
      if (navigator.canShare?.({ files: [file] })) setShareable({ file, key: settingsKey })
      else setError('Sharing a file is not supported in this browser. Use Save instead.')
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not generate the export.')
    } finally {
      setDownloading(false)
    }
  }

  /**
   * A chosen option, in the site's own selection vocabulary.
   *
   * FilterPill and the profile tabs mark a selection with a neutral fill, not
   * with brand red — and this dialog's own trigger says why: "Red is reserved
   * for the one action a screen wants from you." With a look, a size, an
   * orientation, a resolution and a paper all able to go red at once, five
   * resting states were competing with Save, which is the only thing here that
   * should be red.
   */
  const pressed = (on: boolean) =>
    [
      focusRing,
      on
        ? 'bg-neutral-800 border-neutral-500 text-white'
        : 'bg-neutral-900/60 border-neutral-800 text-neutral-400 hover:border-neutral-600 hover:text-white',
    ].join(' ')

  return (
    <div
      className="fixed inset-0 bg-black/95 z-50 flex items-center justify-center p-4"
      onMouseDown={e => { pressedOnBackdrop.current = e.target === e.currentTarget }}
      onClick={e => { if (e.target === e.currentTarget && pressedOnBackdrop.current) requestClose() }}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="export-title"
        // dvh rather than vh: on iOS Safari vh is the *large* viewport, so with
        // the URL bar showing the panel runs past what can actually be seen —
        // and the page behind is scroll-locked, so the bar never retracts and
        // Save sits under the browser chrome. Modal carries the same line.
        className="bg-neutral-900 max-w-4xl w-full max-h-[calc(100dvh-2rem)] overflow-y-auto overscroll-contain focus:outline-none"
      >
        <div className="flex items-center justify-between p-5 border-b border-neutral-800 sticky top-0 bg-neutral-900 z-10">
          <div>
            <h2 id="export-title" className="text-white font-bold text-xl">Export</h2>
            <p className="text-neutral-400 text-sm mt-1">
              {many ? `${photos.length} photographs` : 'Save or share this photograph'}
            </p>
          </div>
          <button
            type="button"
            onClick={requestClose}
            disabled={downloading}
            aria-label="Close"
            className={`${iconButtonClass} -mr-3`}
          >
            <svg className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex flex-col lg:flex-row">
          {/* Pinned on a phone, where this stacks above the controls and every
              one of them was otherwise changed with the result off screen. */}
          <div className="lg:flex-1 p-5 bg-neutral-950 sticky top-[69px] z-[5] lg:static border-b border-neutral-800 lg:border-b-0">
            <h3 className={sectionLabel}>Preview</h3>
            <p role="status" aria-live="polite" className="sr-only">
              {loadingPreview ? 'Rendering the export' : exportSize ? `Ready, ${exportSize.w} by ${exportSize.h} pixels` : ''}
            </p>
            {/* Sized to the export, not to a fixed box. This was locked at 4:3,
                the one ratio the tool never produces. */}
            <div
              className="relative bg-black flex items-center justify-center mx-auto max-h-[34vh] lg:max-h-[62vh]"
              style={{ aspectRatio: exportSize ? `${exportSize.w} / ${exportSize.h}` : '4 / 3' }}
            >
              {loadingPreview && !previewUrl && (
                <div className="w-8 h-8 border-2 border-neutral-700 border-t-white rounded-full animate-spin" />
              )}
              {previewUrl && (
                // A plain img on purpose: a blob: URL for an image the server
                // has already composited and sized.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={previewUrl}
                  alt={`This photograph exported as ${look.name}`}
                  className={`max-w-full max-h-full object-contain transition-opacity ${loadingPreview ? 'opacity-40' : ''}`}
                />
              )}
              {/* Said in the middle of the picture, because that is where the
                  eye is. A 20px spinner in a corner is easy to miss entirely,
                  and then a stale preview reads as a finished one. */}
              {loadingPreview && previewUrl && (
                <div className="absolute inset-0 flex items-center justify-center" aria-hidden>
                  <span className="flex items-center gap-2 bg-black/75 text-white text-[11px] uppercase tracking-wider font-bold px-3 py-2">
                    <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Rendering
                  </span>
                </div>
              )}
              {error && !loadingPreview && !previewUrl && (
                <p className="px-6 text-center text-sm text-neutral-400">{error}</p>
              )}
            </div>

            {/* The set, when there is one. A single photograph has no strip. */}
            {many && (
              <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
                {photos.map((p, i) => (
                  <button
                    type="button"
                    key={p.id}
                    onClick={() => setIndex(i)}
                    aria-label={`Photograph ${i + 1} of ${photos.length}`}
                    aria-pressed={i === index}
                    className={`shrink-0 w-12 h-12 border transition-colors ${
                      i === index ? 'border-brand' : 'border-neutral-700 hover:border-neutral-500'
                    }`}
                    style={p.thumbnailPath
                      ? { backgroundImage: `url(${p.thumbnailPath})`, backgroundSize: 'cover', backgroundPosition: 'center' }
                      : undefined}
                  />
                ))}
              </div>
            )}
          </div>

          <div className="lg:w-80 p-5 border-t lg:border-t-0 lg:border-l border-neutral-800">
            <h3 id={`${fid}-look`} className={sectionLabel}>Look</h3>
            <div role="group" aria-labelledby={`${fid}-look`} className="grid grid-cols-3 gap-2 mb-6">
              {LOOKS.map(l => (
                <button
                  type="button"
                  key={l.id}
                  onClick={() => chooseLook(l.id)}
                  aria-pressed={lookId === l.id}
                  className={`p-3 text-left border transition-colors ${pressed(lookId === l.id)}`}
                >
                  <span className="block text-sm font-medium">{l.name}</span>
                  <span className="block text-[11px] text-neutral-400">{l.note}</span>
                </button>
              ))}
            </div>

            <h3 id={`${fid}-size`} className={sectionLabel}>Size</h3>
            <div role="group" aria-labelledby={`${fid}-size`} className="grid grid-cols-3 gap-2 mb-3">
              {FORMATS.map(f => (
                <button
                  type="button"
                  key={f.id}
                  onClick={() => setFormat(f.id)}
                  aria-pressed={format === f.id}
                  className={`p-2 border transition-colors ${pressed(format === f.id)}`}
                >
                  <span
                    aria-hidden
                    className={`block w-full mb-1.5 border ${format === f.id ? 'border-brand' : 'border-neutral-600'}`}
                    style={{ aspectRatio: swatchRatio(f, landscape, photo.width, photo.height) }}
                  />
                  <span className="block text-[11px] font-medium leading-tight">{f.name}</span>
                  <span className="block text-[10px] text-neutral-400 leading-tight">{f.note}</span>
                </button>
              ))}
            </div>

            {turnable && (
              <div role="group" aria-label="Orientation" className="inline-flex bg-neutral-900 border border-neutral-700 mb-3">
                {([false, true] as const).map(value => (
                  <button
                    type="button"
                    key={String(value)}
                    onClick={() => setLandscape(value)}
                    aria-pressed={landscape === value}
                    className={`px-4 py-1.5 text-xs uppercase tracking-wide font-bold transition-colors ${
                      landscape === value ? 'bg-white text-black' : 'text-neutral-400 hover:text-white'
                    }`}
                  >
                    {value ? 'Landscape' : 'Portrait'}
                  </button>
                ))}
              </div>
            )}

            <h3 id={`${fid}-resolution`} className={sectionLabel}>Resolution</h3>
            <div role="group" aria-labelledby={`${fid}-resolution`} className="grid grid-cols-3 gap-2 mb-2">
              {RESOLUTIONS.map(r => {
                const usable = offered.includes(r.id)
                return (
                  <button
                    type="button"
                    key={r.id}
                    onClick={() => setResolution(r.id)}
                    disabled={!usable}
                    aria-pressed={chosen === r.id}
                    title={usable ? undefined : 'This photograph is not large enough for this size'}
                    className={`p-2 border transition-colors ${
                      usable ? pressed(chosen === r.id) : 'bg-neutral-900 border-neutral-800 text-neutral-700 cursor-not-allowed'
                    }`}
                  >
                    <span className="block text-[11px] font-medium leading-tight">{r.name}</span>
                    <span className="block text-[10px] text-neutral-400 leading-tight">{r.note}</span>
                  </button>
                )
              })}
            </div>
            {/* The file's own measurements, from the render itself. A size
                control that does not say what it produces is a guess. */}
            <p className="text-neutral-400 text-[11px] mb-6 tabular-nums h-4">
              {exportSize ? `${exportSize.w} × ${exportSize.h} px` : ''}
            </p>

            <button
              type="button"
              onClick={() => setAdjusting(v => !v)}
              aria-expanded={adjusting}
              className="flex items-center gap-2 w-full text-neutral-400 hover:text-white text-xs uppercase tracking-wider mb-4 transition-colors"
            >
              <svg
                className={`w-3 h-3 transition-transform ${adjusting ? 'rotate-90' : ''}`}
                fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
              Adjust
            </button>

            {adjusting && (
              <div className="space-y-4 mb-6 pb-6 border-b border-neutral-800">
                {prints.paper && (
                  <div>
                    <FieldCaption id={`${fid}-paper`}>Paper</FieldCaption>
                    <div role="group" aria-labelledby={`${fid}-paper`} className="inline-flex bg-neutral-900 border border-neutral-700">
                      {(['light', 'dark'] as ExportTheme[]).map(t => (
                        <button
                          type="button"
                          key={t}
                          onClick={() => setPaper(t)}
                          aria-pressed={theme === t}
                          className={`px-4 py-1.5 text-xs uppercase tracking-wide font-medium capitalize transition-colors ${focusRing} ${
                            theme === t ? 'bg-neutral-800 text-white' : 'text-neutral-500 hover:text-white'
                          }`}
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {prints.mat && (
                  <div>
                    <FieldLabel htmlFor={`${fid}-mat`}>Photograph size</FieldLabel>
                    <input
                      id={`${fid}-mat`}
                      type="range"
                      min={0}
                      max={100}
                      value={matWidth}
                      onChange={e => setMat(Number(e.target.value))}
                      className="w-full accent-brand"
                    />
                  </div>
                )}

                <div role="group" aria-label="What the export prints" className="space-y-3">
                  {photo.camera && prints.camera && (
                    <Toggle checked={showCamera} onChange={setShowCamera} label={`Show camera (${photo.camera})`} />
                  )}
                  {photo.filmStock && prints.film && (
                    <Toggle checked={showFilm} onChange={setShowFilm} label={`Show film (${photo.filmStock})`} />
                  )}
                  {prints.username && (
                    <Toggle checked={showUsername} onChange={setShowUsername} label="Credit the photographer" />
                  )}
                  {prints.date && <Toggle checked={showDate} onChange={setShowDate} label="Show date" />}
                  {prints.qr && <Toggle checked={showQR} onChange={setShowQR} label="Show QR code" />}
                  {prints.caption && <Toggle checked={showCaption} onChange={setShowCaption} label="Show caption" />}
                </div>

                {prints.date && showDate && (
                  <div>
                    <FieldLabel htmlFor={`${fid}-date`}>Date</FieldLabel>
                    <input
                      id={`${fid}-date`}
                      type="date"
                      value={customDate}
                      onChange={e => setCustomDate(e.target.value)}
                      className={fieldClass}
                    />
                  </div>
                )}

                {prints.caption && showCaption && (
                  <div>
                    <FieldLabel htmlFor={`${fid}-caption`}>Caption</FieldLabel>
                    <input
                      id={`${fid}-caption`}
                      type="text"
                      value={customCaption}
                      onChange={e => setCustomCaption(e.target.value)}
                      placeholder="Leave empty for none"
                      maxLength={CAPTION_MAX_LENGTH}
                      className={fieldClass}
                    />
                  </div>
                )}
              </div>
            )}

            {error && previewUrl && (
              <p role="status" className="mb-4 text-sm text-brand">{error}</p>
            )}

            <div className="flex gap-2">
              {canShare && (
                <Button onClick={handleShare} disabled={downloading} variant="secondary" fullWidth>
                  {shareable?.key === settingsKey ? 'Share now' : 'Share'}
                </Button>
              )}
              <Button onClick={handleDownload} disabled={downloading} fullWidth>
                {downloading ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Working
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    <span className="whitespace-nowrap">Save</span>
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        onChange={e => onChange(e.target.checked)}
        className="w-4 h-4 bg-neutral-800 border-neutral-700 text-brand focus:ring-brand focus:ring-offset-0"
      />
      <span className="text-neutral-300 text-sm">{label}</span>
    </label>
  )
}
