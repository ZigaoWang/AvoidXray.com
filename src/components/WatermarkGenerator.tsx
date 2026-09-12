'use client'
import { useState, useEffect, useId, useRef, useCallback } from 'react'
import FieldLabel from '@/components/ui/FieldLabel'
import { fieldClass } from '@/components/ui/Field'
import Button, { iconButtonClass } from '@/components/ui/Button'
import { useDialogBehavior } from '@/components/ui/dialog'

import {
  availableResolutions,
  canTurn,
  type ExportFormat,
  type ExportStyle,
  type Resolution,
} from '@/lib/exportFormats'

interface WatermarkProps {
  photoId: string
  camera?: string | null
  filmStock?: string | null
  takenDate?: string | null
  width: number
  height: number
  onClose: () => void
}

type ExportTheme = 'light' | 'dark'

/**
 * How large a file this makes, in the terms someone picking one thinks in.
 *
 * The pixel count is not spelled out here because it depends on the format and
 * on the photograph: the route measures the render and reports it, and that
 * measured number is what the dialog prints.
 */
const RESOLUTIONS: { id: Resolution; name: string; note: string }[] = [
  { id: 'web', name: 'Web', note: 'Posting' },
  { id: 'high', name: 'High', note: 'Keeping' },
  { id: 'max', name: 'Max', note: 'Printing' },
]

/** Sized for where the picture is going; the ratio is drawn on the button. */
const STYLES: { id: ExportStyle; name: string; note: string }[] = [
  { id: 'bare', name: 'Bare', note: 'Photograph only' },
  { id: 'clean', name: 'Clean', note: 'Gallery print' },
  { id: 'sprocket', name: 'Sprocket', note: 'Full film width' },
  { id: 'negative', name: 'Negative', note: 'Orange mask' },
  { id: 'slide', name: 'Slide', note: 'Mounted' },
]

/** What each style can actually show, so nothing offers a control it ignores. */
const SUPPORTS: Record<ExportStyle, { caption: boolean; gear: boolean; byline: boolean; qr: boolean; paper: boolean; mat: boolean }> = {
  bare:     { caption: false, gear: false, byline: false, qr: false, paper: true,  mat: true },
  clean:    { caption: true,  gear: true,  byline: true,  qr: true,  paper: true,  mat: false },
  sprocket: { caption: false, gear: true,  byline: true,  qr: false, paper: true,  mat: false },
  negative: { caption: false, gear: true,  byline: true,  qr: false, paper: true,  mat: false },
  slide:    { caption: true,  gear: true,  byline: true,  qr: false, paper: true,  mat: false },
}

type FormatChoice = { id: ExportFormat; name: string; note: string; ratio: string }

const FORMATS: FormatChoice[] = [
  { id: 'post', name: 'Post', note: '4:5', ratio: '4 / 5' },
  { id: 'square', name: 'Square', note: '1:1', ratio: '1 / 1' },
  { id: 'story', name: 'Story', note: '9:16', ratio: '9 / 16' },
  { id: 'original', name: 'As shot', note: 'Own ratio', ratio: '3 / 2' },
]

/** The shape a format will actually come out as, for the button's swatch. */
function swatchRatio(f: FormatChoice, landscape: boolean, srcW: number, srcH: number): string {
  // "As shot" is the photograph's own ratio and nothing else; it was drawn as a
  // fixed 3:2 landscape, which is the one swatch that could not be right for
  // every photograph.
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

/** The message a failed render should show, preferring the server's own. */
async function describeFailure(response: Response): Promise<string> {
  const data = await response.json().catch(() => null)
  return typeof data?.error === 'string'
    ? data.error
    : 'Could not generate the watermark. Please try again.'
}

export default function WatermarkGenerator({ photoId, camera, filmStock, takenDate, width, height, onClose }: WatermarkProps) {
  // Always open: the parent mounts this component only while the dialog is
  // showing, and unmounts it to close.
  const panelRef = useDialogBehavior({ open: true, onClose })
  // Prefix for this form's control ids, so a label points at its own field
  // even when the page renders the form twice.
  const fid = useId()


  const [style, setStyle] = useState<ExportStyle>('clean')
  const supports = SUPPORTS[style]
  const [format, setFormat] = useState<ExportFormat>('post')
  const [mat, setMat] = useState(55)
  const [theme, setTheme] = useState<ExportTheme>('light')
  const [downloading, setDownloading] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [loadingPreview, setLoadingPreview] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Only the sizes this photograph can fill. A step it cannot reach would make
  // a bigger file that is no sharper, so it is not offered at all rather than
  // offered and quietly clamped.
  const [resolution, setResolution] = useState<Resolution>('web')
  const offered = availableResolutions(format, width, height)
  const chosen: Resolution = offered.includes(resolution) ? resolution : offered[offered.length - 1]

  // Measured by the route on the render it just returned, so the size printed
  // under the control is the file's own and not a second guess at the geometry.
  const [exportSize, setExportSize] = useState<{ w: number; h: number } | null>(null)

  // Starts the way the photograph does. Every canvas is written upright because
  // it was sized for a feed, and two thirds of this library is not: 696 of 1076
  // photographs are landscape, and each was being stood up inside a portrait
  // frame with the mat absorbing the difference.
  const [landscape, setLandscape] = useState(width > height)
  const turnable = canTurn(format)

  // The URL currently held by the <img>. Kept in a ref because both the
  // replacement path and the unmount cleanup need to revoke whatever is live
  // at that moment — reading it from state captured each one at the wrong
  // time, so preview blobs were never released.
  const previewUrlRef = useRef<string | null>(null)

  // Customization options
  const [showCamera, setShowCamera] = useState(true)
  const [showFilm, setShowFilm] = useState(true)
  const [showUsername, setShowUsername] = useState(true)
  const [showDate, setShowDate] = useState(!!takenDate)
  // Off by default: it is for prints, and it costs the caption its width.
  const [showQR, setShowQR] = useState(false)
  const [showCaption, setShowCaption] = useState(true)
  const [customDate, setCustomDate] = useState(() => {
    if (takenDate) {
      const date = new Date(takenDate)
      return date.toISOString().split('T')[0]
    }
    return ''
  })
  const [customCaption, setCustomCaption] = useState('Shot on film')

  // Toggles and the style apply at once; the two text fields wait for typing
  // to settle. The download always uses the live values.
  const settledCaption = useDebounced(customCaption, TYPING_SETTLE_MS)
  const settledDate = useDebounced(customDate, TYPING_SETTLE_MS)

  const buildParams = useCallback(
    (caption: string, date: string, preview: boolean) => {
      const params = new URLSearchParams({
        id: photoId,
        style,
        format,
        theme,
        resolution: chosen,
        landscape: turnable && landscape ? '1' : '0',
        mat: String(mat),
        showCamera: showCamera ? '1' : '0',
        showFilm: showFilm ? '1' : '0',
        showUsername: showUsername ? '1' : '0',
        showDate: showDate ? '1' : '0',
        showQR: showQR ? '1' : '0',
        showCaption: showCaption ? '1' : '0',
      })
      if (preview) params.set('preview', '1')
      if (showCaption && caption) params.set('caption', caption)
      if (date) params.set('customDate', date)
      return params
    },
    [photoId, style, format, theme, chosen, turnable, landscape, mat, showCamera, showFilm, showUsername, showDate, showQR, showCaption]
  )

  // Load preview when style or options change
  useEffect(() => {
    // Supersedes the in-flight render rather than letting it finish unread,
    // so changing two options quickly does not leave the server compositing
    // an image nobody will see.
    const controller = new AbortController()
    setLoadingPreview(true)

    const loadPreview = async () => {
      try {
        const params = buildParams(settledCaption, settledDate, true)
        const response = await fetch(`/api/watermark?${params}`, { signal: controller.signal })
        if (!response.ok) {
          setError(await describeFailure(response))
          return
        }

        const w = Number(response.headers.get('X-Export-Width'))
        const h = Number(response.headers.get('X-Export-Height'))
        setExportSize(w > 0 && h > 0 ? { w, h } : null)

        const url = URL.createObjectURL(await response.blob())
        if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
        previewUrlRef.current = url
        setPreviewUrl(url)
        setError(null)
      } catch {
        // An aborted request is this effect being replaced, not a failure.
        if (controller.signal.aborted) return
        setError('Could not reach the server. Check your connection and try again.')
      } finally {
        if (!controller.signal.aborted) setLoadingPreview(false)
      }
    }

    loadPreview()
    return () => controller.abort()
  }, [buildParams, settledCaption, settledDate])

  // Release the live preview when the dialog closes.
  useEffect(() => {
    return () => {
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
    }
  }, [])

  const handleDownload = async () => {
    setDownloading(true)
    setError(null)
    let url: string | null = null
    try {
      const params = buildParams(customCaption, customDate, false)
      const response = await fetch(`/api/watermark?${params}`)
      if (!response.ok) {
        setError(await describeFailure(response))
        return
      }

      url = URL.createObjectURL(await response.blob())
      const link = document.createElement('a')
      link.href = url
      link.download = `avoidxray-${photoId}-${style}-${format}-${chosen}.jpg`
      link.click()
    } catch {
      setError('Could not reach the server. Check your connection and try again.')
    } finally {
      // Revoked after the click has been handled, and in a finally so a
      // failure part-way through cannot leak the object URL.
      if (url) URL.revokeObjectURL(url)
      setDownloading(false)
    }
  }

  // The backdrop is /95 rather than the /80 every dialog on the site uses, as
  // the lightbox is and for the same reason: what this frames is a photograph
  // being judged, so the surround is part of looking at it.
  return (
    <div className="fixed inset-0 bg-black/95 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="watermark-title"
        className="bg-neutral-900 max-w-4xl w-full max-h-[90vh] overflow-y-auto focus:outline-none"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-neutral-800 sticky top-0 bg-neutral-900 z-10">
          <div>
            <h2 id="watermark-title" className="text-white font-bold text-xl">Download with Watermark</h2>
            <p className="text-neutral-500 text-sm mt-1">Choose a style for your photo</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className={`${iconButtonClass} -mr-3`}
          >
            <svg className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex flex-col lg:flex-row">
          {/* Preview */}
          <div className="lg:flex-1 p-5 bg-neutral-950">
            <p className="text-neutral-500 text-xs uppercase tracking-wider mb-3">Preview</p>
            <div className="relative aspect-[4/3] bg-black flex items-center justify-center">
              {loadingPreview && !previewUrl && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-8 h-8 border-2 border-neutral-700 border-t-white rounded-full animate-spin" />
                </div>
              )}
              {previewUrl && (
                // A plain img on purpose: this is a blob: URL for an image the
                // server has already composited and sized, so there is nothing
                // for next/image to fetch, cache or resize.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={previewUrl}
                  alt={`Preview of this photo with the ${style} watermark`}
                  className="max-w-full max-h-full object-contain"
                />
              )}
              {loadingPreview && previewUrl && (
                <div className="absolute top-2 right-2">
                  <div className="w-5 h-5 border-2 border-neutral-700 border-t-white rounded-full animate-spin" />
                </div>
              )}
              {/* A failure used to leave an empty black square with no
                  explanation. The server's own message is shown when it has
                  one, which is how a rate limit tells you to wait. */}
              {error && !loadingPreview && !previewUrl && (
                <p className="px-6 text-center text-sm text-neutral-400">{error}</p>
              )}
            </div>
            {error && previewUrl && (
              <p role="status" className="mt-3 text-sm text-brand">{error}</p>
            )}
          </div>

          {/* Options */}
          <div className="lg:w-80 p-5 border-t lg:border-t-0 lg:border-l border-neutral-800">
            <p className="text-neutral-500 text-xs uppercase tracking-wider mb-3">Style</p>
            <div className="grid grid-cols-3 gap-2 mb-5">
              {STYLES.map(st => (
                <button
                  key={st.id}
                  onClick={() => setStyle(st.id)}
                  aria-pressed={style === st.id}
                  className={`p-3 text-left border transition-colors ${
                    style === st.id
                      ? 'bg-brand/10 border-brand text-white'
                      : 'bg-neutral-800/50 border-neutral-700 text-neutral-300 hover:border-neutral-600'
                  }`}
                >
                  <span className="block text-sm font-medium">{st.name}</span>
                  <span className="block text-[11px] text-neutral-500">{st.note}</span>
                </button>
              ))}
            </div>

            <p className="text-neutral-500 text-xs uppercase tracking-wider mb-3">Format</p>
            <div className="grid grid-cols-4 gap-2 mb-5">
              {FORMATS.map(f => (
                <button
                  key={f.id}
                  onClick={() => setFormat(f.id)}
                  aria-pressed={format === f.id}
                  className={`p-2 border transition-colors ${
                    format === f.id
                      ? 'bg-brand/10 border-brand text-white'
                      : 'bg-neutral-800/50 border-neutral-700 text-neutral-400 hover:border-neutral-600'
                  }`}
                >
                  {/* Drawn the way round it will actually come out. This swatch
                      used to show every format standing up, including "As shot"
                      at a fixed 3:2 that was wrong for half the library. */}
                  <span
                    aria-hidden
                    className={`block w-full mb-1.5 border ${format === f.id ? 'border-brand' : 'border-neutral-600'}`}
                    style={{ aspectRatio: swatchRatio(f, landscape, width, height) }}
                  />
                  <span className="block text-[11px] font-medium leading-tight">{f.name}</span>
                  <span className="block text-[10px] text-neutral-500 leading-tight">{f.note}</span>
                </button>
              ))}
            </div>

            {/* Only where it changes something: a square has no long side, and
                "As shot" already takes the photograph's own shape. */}
            {turnable && (
              <>
                <p className="text-neutral-500 text-xs uppercase tracking-wider mb-3">Orientation</p>
                <div className="inline-flex bg-neutral-900 border border-neutral-700 mb-6">
                  {([false, true] as const).map(value => (
                    <button
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
              </>
            )}

            <p className="text-neutral-500 text-xs uppercase tracking-wider mb-3">Resolution</p>
            <div className="grid grid-cols-3 gap-2 mb-2">
              {RESOLUTIONS.map(r => {
                const usable = offered.includes(r.id)
                return (
                  <button
                    key={r.id}
                    onClick={() => setResolution(r.id)}
                    disabled={!usable}
                    aria-pressed={chosen === r.id}
                    title={usable ? undefined : 'This photograph is not large enough for this size'}
                    className={`p-2 border transition-colors ${
                      !usable
                        ? 'bg-neutral-900 border-neutral-800 text-neutral-700 cursor-not-allowed'
                        : chosen === r.id
                          ? 'bg-brand/10 border-brand text-white'
                          : 'bg-neutral-800/50 border-neutral-700 text-neutral-400 hover:border-neutral-600'
                    }`}
                  >
                    <span className="block text-[11px] font-medium leading-tight">{r.name}</span>
                    <span className="block text-[10px] text-neutral-500 leading-tight">{r.note}</span>
                  </button>
                )
              })}
            </div>
            {/* The file's own measurements, from the render itself. A size
                control that does not say what it produces is a guess. */}
            <p className="text-neutral-500 text-[11px] mb-6 tabular-nums">
              {exportSize ? `${exportSize.w} × ${exportSize.h} px` : ' '}
            </p>

            {supports.mat && (
              <>
                <p className="text-neutral-500 text-xs uppercase tracking-wider mb-3">Photograph size</p>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={mat}
                  onChange={e => setMat(Number(e.target.value))}
                  aria-label="Photograph size"
                  className="w-full mb-6 accent-brand"
                />
              </>
            )}

            {supports.paper && (
              <>
            <p className="text-neutral-500 text-xs uppercase tracking-wider mb-3">Paper</p>
            <div className="inline-flex bg-neutral-900 border border-neutral-700 mb-6">
              {(['light', 'dark'] as ExportTheme[]).map(t => (
                <button
                  key={t}
                  onClick={() => setTheme(t)}
                  aria-pressed={theme === t}
                  className={`px-4 py-1.5 text-xs uppercase tracking-wide font-bold capitalize transition-colors ${
                    theme === t ? 'bg-white text-black' : 'text-neutral-400 hover:text-white'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
              </>
            )}

            {/* Only the controls this style acts on; the rest would do nothing. */}
            {(supports.caption || supports.gear || supports.byline || supports.qr) && (
              <p className="text-neutral-500 text-xs uppercase tracking-wider mb-3">Customize</p>
            )}
            <div className="space-y-3 mb-6">
              {camera && supports.gear && (
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showCamera}
                    onChange={(e) => setShowCamera(e.target.checked)}
                    className="w-4 h-4 bg-neutral-800 border-neutral-700 text-brand focus:ring-brand focus:ring-offset-0"
                  />
                  <span className="text-neutral-300 text-sm">Show camera ({camera})</span>
                </label>
              )}
              {filmStock && supports.gear && (
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showFilm}
                    onChange={(e) => setShowFilm(e.target.checked)}
                    className="w-4 h-4 bg-neutral-800 border-neutral-700 text-brand focus:ring-brand focus:ring-offset-0"
                  />
                  <span className="text-neutral-300 text-sm">Show film ({filmStock})</span>
                </label>
              )}
              {supports.caption && (
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showCaption}
                    onChange={(e) => setShowCaption(e.target.checked)}
                    className="w-4 h-4 bg-neutral-800 border-neutral-700 text-brand focus:ring-brand focus:ring-offset-0"
                  />
                  <span className="text-neutral-300 text-sm">Show caption</span>
                </label>
              )}

              {supports.qr && (
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showQR}
                    onChange={(e) => setShowQR(e.target.checked)}
                    className="w-4 h-4 bg-neutral-800 border-neutral-700 text-brand focus:ring-brand focus:ring-offset-0"
                  />
                  <span className="text-neutral-300 text-sm">Show QR code</span>
                </label>
              )}

              {/* The byline credit. Every other field on this panel could be
                  switched off; this one held state and sent a parameter the
                  route already reads, and simply had no control, so it was
                  fixed on for everybody. */}
              {supports.byline && (
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showUsername}
                    onChange={(e) => setShowUsername(e.target.checked)}
                    className="w-4 h-4 bg-neutral-800 border-neutral-700 text-brand focus:ring-brand focus:ring-offset-0"
                  />
                  <span className="text-neutral-300 text-sm">Show your username</span>
                </label>
              )}

              {supports.byline && (
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showDate}
                  onChange={(e) => setShowDate(e.target.checked)}
                  className="w-4 h-4 bg-neutral-800 border-neutral-700 text-brand focus:ring-brand focus:ring-offset-0"
                />
                <span className="text-neutral-300 text-sm">Show date</span>
              </label>
              )}

              {supports.byline && showDate && (
                <div>
                  <FieldLabel htmlFor={`${fid}-date`}>
                    {takenDate ? 'Date (from photo taken date)' : 'Date'}
                  </FieldLabel>
                  <input
                    id={`${fid}-date`}
                    type="date"
                    value={customDate}
                    onChange={(e) => setCustomDate(e.target.value)}
                    className={`${fieldClass}`}
                  />
                </div>
              )}

              {supports.caption && showCaption && (
                <>
                  <div>
                    <FieldLabel htmlFor={`${fid}-caption`}>Caption</FieldLabel>
                    <input
                      id={`${fid}-caption`}
                      type="text"
                      value={customCaption}
                      onChange={(e) => setCustomCaption(e.target.value)}
                      placeholder="Shot on film"
                      maxLength={50}
                      className={`${fieldClass}`}
                    />
                  </div>
                </>
              )}
            </div>

            {/* Photo info */}
            {(camera || filmStock) && (
              <div className="mb-6 p-3 bg-neutral-800/30 border border-neutral-800">
                <p className="text-neutral-500 text-xs uppercase tracking-wider mb-2">Photo Info</p>
                <div className="text-neutral-300 text-sm space-y-1">
                  {camera && <p><span className="text-neutral-500">Camera:</span> {camera}</p>}
                  {filmStock && <p><span className="text-neutral-500">Film:</span> {filmStock}</p>}
                </div>
              </div>
            )}

            {/* Download button */}
            <Button
              onClick={handleDownload}
              disabled={downloading} fullWidth>
              {downloading ? (
                <>
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Generating…
                </>
              ) : (
                <>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  <span className="whitespace-nowrap">Download</span>
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
