'use client'
import { useState, useEffect, useId, useRef, useCallback, useMemo } from 'react'
import FieldLabel, { FieldCaption } from '@/components/ui/FieldLabel'
import { fieldClass, FieldError, FieldHint } from '@/components/ui/Field'
import Button, { iconButtonClass } from '@/components/ui/Button'
import { useDialogBehavior } from '@/components/ui/dialog'
import { focusRing } from '@/components/ui/focus'
import LookMark from '@/components/LookMark'
import {
  CAPTION_MAX_LENGTH,
  LOOKS,
  STYLE_PRINTS,
  availableResolutions,
  canTurn,
  lookById,
  nativeFormat,
  ratioOf,
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
const FORMATS: { id: ExportFormat; name: string; note: string }[] = [
  { id: 'original', name: 'As shot', note: 'Own' },
  { id: 'frame', name: 'Frame', note: '3:2 · 4×6' },
  { id: 'classic', name: 'Classic', note: '4:3 · 645' },
  { id: 'post', name: 'Post', note: '4:5 · 8×10' },
  { id: 'square', name: 'Square', note: '1:1 · 6×6' },
  { id: 'story', name: 'Story', note: '9:16' },
]

const RESOLUTIONS: { id: Resolution; name: string; note: string }[] = [
  { id: 'web', name: 'Web', note: 'Posting' },
  { id: 'high', name: 'High', note: 'Keeping' },
  { id: 'max', name: 'Max', note: 'Printing' },
]

/**
 * The shape a format will actually come out as, for the button's swatch.
 *
 * Read from the canvas table rather than from a second copy of it written
 * beside the names. "As shot" is the photograph's own ratio and nothing else.
 */
function swatchRatio(format: ExportFormat, landscape: boolean, srcW: number, srcH: number): string {
  if (format === 'original') return `${srcW} / ${srcH}`
  return ratioOf(format, canTurn(format) && landscape)
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

  // From the header as well as the body: the 429 carries it in the body and
  // the 503 only in Retry-After, so reading one of the two dropped the number
  // on whichever it was not.
  const after = Number(data?.retryAfter) || Number(response.headers.get('Retry-After'))
  if (!(after > 0)) return message

  // As time, not as a count of seconds. A rate limit's window is measured from
  // its oldest hit, so this is routinely 287 — and "wait 287s" reads as a
  // malfunction rather than as an answer.
  const wait = after >= 90 ? `about ${Math.round(after / 60)} minutes` : `about ${after} seconds`
  return `${message} Try again in ${wait}.`
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
  /**
   * Which button is busy, rather than one flag for both.
   *
   * A single flag put the spinner and the word "Working" on Save while the user
   * had pressed Share, and dimmed the button they had actually pressed.
   */
  const [working, setWorking] = useState<null | 'save' | 'share'>(null)
  const downloading = working !== null

  /**
   * Dismissal.
   *
   * The backdrop is refused while a file is being made: dismissing there is
   * almost always a mis-click, and it throws away a render the viewer asked for
   * and is waiting on. Modal has carried that gate since it was written.
   *
   * Escape and the close button are never refused. They are deliberate — you
   * do not press Escape by accident — and a gate on them is a trap: a fetch
   * that never settles leaves `working` set forever, and with all three exits
   * closed the only way out of the dialog is to reload the page.
   */
  const requestClose = () => {
    inFlight.current?.abort()
    onClose()
  }
  const requestCloseFromBackdrop = () => { if (!downloading) onClose() }

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

  /**
   * How far down the preview has to start to clear the header, measured rather
   * than guessed.
   *
   * It was a literal 69px against a header that is nearer 93 — 69 is what it
   * measured before the subtitle was added — so the preview slid under an
   * opaque bar. A literal breaks again the moment the subtitle wraps, which it
   * does on a 320px screen.
   */
  const headerRef = useRef<HTMLDivElement>(null)
  const [headerHeight, setHeaderHeight] = useState(93)
  useEffect(() => {
    const header = headerRef.current
    if (!header) return
    const measure = () => setHeaderHeight(header.offsetHeight)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(header)
    return () => observer.disconnect()
  }, [])

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

  /**
   * The look the render will actually produce, which is not always the one that
   * was pressed.
   *
   * Print and Darkroom are one renderer with two papers, and the paper is also
   * a control inside Adjust — so choosing Print and then setting the paper to
   * dark produces a file identical to Darkroom while the grid still showed
   * Print pressed and offered Darkroom as an alternative that would change
   * nothing. The grid marks what is being made.
   */
  const activeLook =
    LOOKS.find(l => l.style === look.style && l.theme === theme)?.id ?? lookId

  const [showCamera, setShowCamera] = useState(true)
  const [showFilm, setShowFilm] = useState(true)
  const [showUsername, setShowUsername] = useState(true)
  const [showDate, setShowDate] = useState(!!photo.takenDate)
  const [showQR, setShowQR] = useState(false)
  const [showCaption, setShowCaption] = useState(true)

  // Seeded before the first render rather than in an effect after it.
  //
  // Set afterwards, the preview effect had already fired with an empty caption,
  // so the dialog opened by rendering a frame with no caption line at all and
  // then replaced it 400ms later with one that had it — the whole canvas
  // changing height as it arrived. Two server renders for one opening, and the
  // first of them wrong.
  const dayOf = (iso: string | null | undefined) =>
    iso ? new Date(iso).toISOString().split('T')[0] : ''

  const [customDate, setCustomDate] = useState(() => dayOf(photo.takenDate))
  const [customCaption, setCustomCaption] = useState(
    () => photo.caption?.slice(0, CAPTION_MAX_LENGTH) ?? ''
  )

  // Each photograph's own caption and date, not one line shared across a set —
  // a caption means nothing applied to thirty-six different pictures. Only on a
  // change of photograph, so the seeding above is not immediately undone.
  const shown = useRef(photo.id)
  useEffect(() => {
    if (shown.current === photo.id) return
    shown.current = photo.id
    setCustomCaption(photo.caption?.slice(0, CAPTION_MAX_LENGTH) ?? '')
    setCustomDate(dayOf(photo.takenDate))
    setShowDate(!!photo.takenDate)
  }, [photo.id, photo.caption, photo.takenDate])

  const chooseLook = (id: LookId) => {
    setLookId(id)
    window.localStorage.setItem(REMEMBERED_LOOK, id)
    // Only a look that insists on a shape moves the size. Print, Darkroom and
    // Bare leave it where it is: they are prints of the frame, and comparing
    // them is the point of having them side by side. The mat stays too.
    const wanted = lookById(id).format
    if (wanted) setFormat(wanted)

    // The paper does go back, because for two of these the paper is the whole
    // difference. Not resetting it was right for the mat and the size and wrong
    // here: an override left in place made Print and Darkroom inert, since
    // pressing either kept whatever paper Adjust had been set to. The pair
    // stopped doing anything at all once it had been touched once.
    setPaper(null)
  }

  const turnable = canTurn(format)
  const offered = useMemo(
    () => availableResolutions(format, photo.width, photo.height, turnable && landscape),
    [format, photo.width, photo.height, turnable, landscape]
  )
  const chosen: Resolution = offered.includes(resolution) ? resolution : offered[offered.length - 1]

  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [loadingPreview, setLoadingPreview] = useState(false)
  // Kept apart, because they mean different things and live in different
  // places. A failed Save was setting the same value the preview reads, so the
  // preview reported itself broken and shrank to its placeholder over a picture
  // that was on screen and fine.
  const [error, setError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
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
    // The look that renders, not the button that was pressed. With a paper
    // override in play those differ, and the file was named for the one that
    // did not make it.
    const parts = [photo.filmStock, photo.camera, lookById(activeLook).name]
      .filter(Boolean)
      .map(part => String(part).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''))
    // The photograph's own tail, so a roll does not save thirty-six files under
    // one name for the browser to disambiguate with " (1)", " (2)".
    return `avoidxray-${[...parts, photo.id.slice(-6)].join('-')}.jpg`
  }

  // Abandoned when the dialog closes, and given a deadline of its own.
  //
  // A Save had neither: closing the dialog left the request running and its
  // render slot held, and a connection that never answered left the button
  // saying "Working" for as long as the tab was open. The route reads the
  // signal too, so an abandoned render is not started.
  const inFlight = useRef<AbortController | null>(null)
  useEffect(() => () => inFlight.current?.abort(), [])

  const render = async () => {
    inFlight.current?.abort()
    const controller = new AbortController()
    inFlight.current = controller
    // Generous: a Max export of a large scan is a real wait. Short enough that
    // a dead connection does not leave the dialog pretending to work.
    const deadline = setTimeout(() => controller.abort(), 120_000)
    try {
      const response = await fetch(`/api/watermark?${settingsKey}`, { signal: controller.signal })
      if (!response.ok) throw new Error(await describeFailure(response))
      return await response.blob()
    } finally {
      clearTimeout(deadline)
      if (inFlight.current === controller) inFlight.current = null
    }
  }

  const handleDownload = async () => {
    if (working) return
    setWorking('save')
    setActionError(null)
    let url: string | null = null
    try {
      url = URL.createObjectURL(await render())
      const link = document.createElement('a')
      link.href = url
      link.download = filename()
      // Attached before clicking: a detached anchor's click is ignored outright
      // in Firefox, and the download simply does not happen.
      link.style.display = 'none'
      document.body.appendChild(link)
      link.click()
      link.remove()
    } catch (failure) {
      if (!(failure instanceof DOMException && failure.name === 'AbortError')) {
        setActionError(failure instanceof Error ? failure.message : 'Could not save the export.')
      }
    } finally {
      // Released on the next turn, not this one. The browser reads the blob
      // asynchronously after the click, and revoking it in the same tick is a
      // race the download loses on a slow machine -- which is exactly the
      // machine a large export is slow on.
      if (url) {
        const released = url
        setTimeout(() => URL.revokeObjectURL(released), 60_000)
      }
      setWorking(null)
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
    if (working) return
    setWorking('share')
    setActionError(null)
    try {
      const file = new File([await render()], filename(), { type: 'image/jpeg' })
      if (navigator.canShare?.({ files: [file] })) setShareable({ file, key: settingsKey })
      else setActionError('This browser cannot share a file. Use Save instead.')
    } catch (failure) {
      if (!(failure instanceof DOMException && failure.name === 'AbortError')) {
        setActionError(failure instanceof Error ? failure.message : 'Could not share the export.')
      }
    } finally {
      setWorking(null)
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
      onClick={e => { if (e.target === e.currentTarget && pressedOnBackdrop.current) requestCloseFromBackdrop() }}
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
        <div
          ref={headerRef}
          className="flex items-center justify-between p-5 border-b border-neutral-800 sticky top-0 bg-neutral-900 z-10"
        >
          <div>
            <h2 id="export-title" className="text-white font-bold text-xl">Export</h2>
            <p className="text-neutral-400 text-sm mt-1">
              {many
                ? `${photos.length} photographs`
                : canShare ? 'Save or share this photograph' : 'Save this photograph'}
            </p>
          </div>
          <button
            type="button"
            onClick={requestClose}
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
          <div
            style={{ top: headerHeight }}
            className="lg:flex-1 p-5 bg-neutral-950 sticky z-[5] lg:static lg:top-auto border-b border-neutral-800 lg:border-b-0"
          >
            <h3 className={sectionLabel}>Preview</h3>
            {/* Mounted whether or not there is anything to say: a region that
                appears at the same moment as its text is not reliably read.
                The failure belongs here too — it reported loading and ready and
                never that the render had been refused. */}
            <p role="status" aria-live="polite" className="sr-only">
              {loadingPreview
                ? 'Rendering the export'
                : error
                  ? ''
                  : exportSize
                    ? `Ready, ${exportSize.w} by ${exportSize.h} pixels`
                    : ''}
            </p>
            <p role="alert" className="sr-only">{actionError ?? (loadingPreview ? '' : error ?? '')}</p>
            {/* Sized to the export, not to a fixed box. This was locked at 4:3,
                the one ratio the tool never produces. */}
            <div
              // A border rather than a bare black field. The frame now takes the
              // export's own proportions, so this line is the file's edge — and
              // without it the Darkroom and Negative looks, which are dark paper
              // on a dark backdrop, simply had no edge to see.
              className="relative bg-neutral-950 border border-neutral-800 flex items-center justify-center mx-auto max-h-[34vh] lg:max-h-[62vh]"
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
                  alt={`This photograph exported as ${lookById(activeLook).name}`}
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
              {/* The same sentence rendered grey here and brand red in the
                  controls column depending only on whether a preview happened
                  to exist. It has one home now, beside the buttons, where the
                  next action is. */}
              {error && !loadingPreview && (
                <p className="px-6 text-center text-sm text-neutral-400">Could not render this export.</p>
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
                  aria-pressed={activeLook === l.id}
                  className={`p-2 text-left border transition-colors ${pressed(activeLook === l.id)}`}
                >
                  <LookMark look={l.id} />
                  <span className="block text-[13px] font-medium leading-tight">{l.name}</span>
                  <span className="block text-[11px] text-neutral-400 leading-tight">{l.note}</span>
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
                    style={{ aspectRatio: swatchRatio(f.id, landscape, photo.width, photo.height) }}
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
                    aria-describedby={usable ? undefined : `${fid}-resolution-why`}
                    className={`p-2 border transition-colors ${
                      usable ? pressed(chosen === r.id) : 'bg-neutral-900 border-neutral-800 text-neutral-500 cursor-not-allowed'
                    }`}
                  >
                    {/* The note inherits when the step is unavailable, or the
                        button dims its own name to 1.7:1 and leaves the word
                        under it bright — the size reading as less important
                        than the word describing it. */}
                    <span className="block text-[11px] font-medium leading-tight">{r.name}</span>
                    <span className={`block text-[10px] leading-tight ${usable ? 'text-neutral-400' : ''}`}>{r.note}</span>
                  </button>
                )
              })}
            </div>
            {/* The file's own measurements, from the render itself. A size
                control that does not say what it produces is a guess. */}
            <p className="text-neutral-400 text-[11px] tabular-nums h-4">
              {exportSize ? `${exportSize.w} × ${exportSize.h} px` : ''}
            </p>
            {/* Said where it can be read. This was a `title` on a disabled
                button: disabled controls dispatch no pointer events, touch has
                no hover, and they are out of the tab order — so the one
                explanation the control had could not be reached on any device
                by anybody. */}
            <div className="mb-6" id={`${fid}-resolution-why`}>
              {offered.length < RESOLUTIONS.length && (
                <FieldHint>
                  {`This scan is ${photo.width} × ${photo.height}; the larger sizes need more than it holds.`}
                </FieldHint>
              )}
            </div>

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
                      // A bare "54" means nothing read aloud; this is a mat
                      // width, so say what it does.
                      aria-valuetext={`Photograph fills ${matWidth} percent`}
                      className={`w-full accent-brand ${focusRing}`}
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

            {(actionError || error) && (
              <div className="mb-4">
                <FieldError>{actionError ?? error}</FieldError>
              </div>
            )}

            {/* aria-busy and a re-entry guard rather than `disabled`.
                Disabling the element that has focus makes the browser drop
                focus to the body, so pressing Save with the keyboard put the
                cursor nowhere and nothing put it back. */}
            <div className="flex gap-2">
              {canShare && (
                <Button
                  onClick={handleShare}
                  aria-busy={working === 'share'}
                  variant="secondary"
                  fullWidth
                >
                  {working === 'share' ? (
                    <>
                      <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Working
                    </>
                  ) : shareable?.key === settingsKey ? (
                    'Open share sheet'
                  ) : (
                    'Share'
                  )}
                </Button>
              )}
              <Button onClick={handleDownload} aria-busy={working === 'save'} fullWidth>
                {working === 'save' ? (
                  <>
                    <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
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
        // accent-brand, as every other checkbox on the site uses. The classes
        // here before it -- text-brand, focus:ring-brand, focus:ring-offset-0 --
        // need @tailwindcss/forms, which is not installed, so all three were
        // inert and these ticked in the operating system's accent colour: blue,
        // on a near-black panel, six lines under a slider that correctly uses
        // accent-brand.
        className={`w-4 h-4 accent-brand ${focusRing}`}
      />
      <span className="text-neutral-300 text-sm">{label}</span>
    </label>
  )
}
