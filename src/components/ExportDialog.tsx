'use client'
import { useState, useEffect, useId, useRef, useCallback, useMemo } from 'react'
import { fieldClass, FieldError } from '@/components/ui/Field'
import Button, { iconButtonClass } from '@/components/ui/Button'
import { useDialogBehavior } from '@/components/ui/dialog'
import { focusRing } from '@/components/ui/focus'
import {
  CAPTION_MAX_LENGTH,
  LOOKS,
  PAPERS,
  PRINT_DPI,
  STYLE_PRINTS,
  lookById,
  paperById,
  printPlan,
  styleFor,
  type Destination,
  type ExportTheme,
  type LookId,
  type PaperId,
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
 * Where it is going. The only sizing question that is asked.
 *
 * It replaces six ratios, four resolution steps, a fit/fill pair and an
 * orientation pair — 288 combinations before the drawer opened. Measured over
 * 895 exports from the server log, the resolution grid was touched 35 times and
 * fit/fill 16, so almost nobody was answering those questions; the shape a file
 * needs follows from where it is going, and the object's own proportions are
 * the honest answer to the rest.
 */
const DESTINATIONS: { id: Destination; name: string; note: string }[] = [
  { id: 'post', name: 'Post', note: 'For a feed' },
  { id: 'print', name: 'Print', note: 'On paper' },
  { id: 'full', name: 'Full', note: 'Every pixel' },
]

/**
 * Holds a value back until the caller stops changing it.
 *
 * The caption is free text, and every keystroke used to trigger a full
 * server-side render — fetching the source from storage and recompositing it —
 * so typing a short caption cost a dozen of them.
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

/** Where the last look is kept, so a decision is not re-made per photograph. */
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
 * panel — under AA.
 */
const sectionLabel = 'text-neutral-400 text-[11px] uppercase tracking-wider mb-2.5'

export default function ExportDialog({ photos, onClose }: ExportDialogProps) {
  /**
   * Which button is busy, rather than one flag for both.
   *
   * A single flag put the spinner and the word "Working" on Save while the user
   * had pressed Share, and dimmed the button they had actually pressed.
   */
  const [working, setWorking] = useState<null | 'save' | 'share'>(null)
  const downloading = working !== null

  const inFlight = useRef<AbortController | null>(null)

  /**
   * Dismissal.
   *
   * The backdrop is refused while a file is being made: dismissing there is
   * almost always a mis-click, and it throws away a render the viewer asked for
   * and is waiting on.
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
   * release, so pressing a tile or drag-selecting the caption and letting go
   * past the panel edge dispatched the click on the backdrop and discarded
   * every setting.
   */
  const pressedOnBackdrop = useRef(false)

  /**
   * Whether this browser will actually take a file.
   *
   * `navigator.canShare` existing is not the question — desktop Chrome has the
   * method and declines files — so it is asked with one, once, at mount.
   */
  const [canShare, setCanShare] = useState(false)
  useEffect(() => {
    const probe = new File([new Uint8Array(1)], 'probe.jpg', { type: 'image/jpeg' })
    setCanShare(Boolean(navigator.canShare?.({ files: [probe] })))
  }, [])

  const [index, setIndex] = useState(0)
  // Clamped where it is read as well as where it is written: photos can shrink
  // under a held index, and the strip below marks the frame whose position
  // matches, which would then be none of them.
  const current = Math.min(index, photos.length - 1)
  const photo = photos[current]
  const many = photos.length > 1
  const landscape = photo.width > photo.height

  /**
   * Which object, remembered across photographs.
   *
   * Read before the first render rather than in an effect after it: restoring
   * it afterwards rendered the default look first and threw that render away.
   */
  const [lookId, setLookId] = useState<LookId>(() => {
    if (typeof window === 'undefined') return 'instant'
    const saved = window.localStorage.getItem(REMEMBERED_LOOK)
    return saved && LOOKS.some(l => l.id === saved) ? (saved as LookId) : 'instant'
  })
  const look = lookById(lookId)

  const [destination, setDestination] = useState<Destination>('post')
  const [paper, setPaper] = useState<PaperId>('4x6')

  /**
   * The two states a print has, and only a print.
   *
   * Darkroom was a seventh tile for one boolean and Bare an eighth for another,
   * which is the accretion this panel was rebuilt to undo. A tile is a
   * different object; a pair under a tile is a different state of the same one.
   */
  const [dark, setDark] = useState(false)
  const [labelled, setLabelled] = useState(true)

  const style = styleFor(lookId, labelled)
  const prints = STYLE_PRINTS[style]
  const theme: ExportTheme = lookId === 'print' ? (dark ? 'dark' : 'light') : look.theme

  const [caption, setCaption] = useState(() => photo.caption?.slice(0, CAPTION_MAX_LENGTH) ?? '')

  // Each photograph's own caption, not one line shared across a set — a caption
  // means nothing applied to thirty-six different pictures.
  const shown = useRef(photo.id)
  useEffect(() => {
    if (shown.current === photo.id) return
    shown.current = photo.id
    setCaption(photo.caption?.slice(0, CAPTION_MAX_LENGTH) ?? '')
  }, [photo.id, photo.caption])

  const chooseLook = (id: LookId) => {
    setLookId(id)
    window.localStorage.setItem(REMEMBERED_LOOK, id)
  }

  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [loadingPreview, setLoadingPreview] = useState(false)
  // Kept apart, because they mean different things and live in different
  // places. A failed Save was setting the same value the preview reads, so the
  // preview reported itself broken and shrank to its placeholder over a picture
  // that was on screen and fine.
  const [error, setError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [exportSizes, setExportSizes] = useState<Record<string, { w: number; h: number }>>({})
  const previewUrlRef = useRef<string | null>(null)

  const settledCaption = useDebounced(caption, TYPING_SETTLE_MS)

  /**
   * What the file will measure.
   *
   * On paper it is arithmetic and needs no server: a 4x6 at 300dpi is 1800 by
   * 1200, turned to suit the frame. On a screen it is whatever the render came
   * back as, reported by the route.
   */
  const sheet = destination === 'print' ? printPlan(paper, landscape, photo.width, photo.height) : null
  const exportSize = sheet ?? exportSizes[destination === 'full' ? 'full' : 'high'] ?? exportSizes.web ?? null

  /** Everything that decides the picture. Where it is going is not part of it. */
  const picture = useCallback(
    (text: string) => {
      const params = new URLSearchParams({
        id: photo.id,
        style,
        // Every look now takes the photograph's own shape, or its own shape as
        // an object. The six-ratio grid this used to carry is gone: not one of
        // the 1076 photographs on the site is square, 4:5 or 9:16, so those
        // were never the picture's shape — only ever a crop for somewhere it
        // was going, which is what the destination below says directly.
        format: 'original',
        theme,
        landscape: landscape ? '1' : '0',
        showCamera: '1',
        showFilm: '1',
        showUsername: '1',
        showDate: photo.takenDate ? '1' : '0',
        showCaption: '1',
      })
      params.set('caption', text)
      return params
    },
    [photo.id, photo.takenDate, style, theme, landscape]
  )

  /**
   * The preview's address, which deliberately does not mention the destination.
   *
   * A preview is drawn at one size whatever is chosen, so including it made
   * every destination click re-fetch pixels that could not differ — a render
   * slot and a rate-limit hit each time, for nothing.
   */
  const previewQuery = useMemo(() => `${picture(settledCaption)}&preview=1`, [picture, settledCaption])

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
        // A superseded request is not allowed to write anything. Without this
        // check a slow preview that came back 429 would run failed() and revoke
        // the blob a newer, successful render had already put on screen.
        if (controller.signal.aborted) return

        if (!response.ok) {
          setError(await describeFailure(response))
          failed()
          return
        }
        setExportSizes(parseSizes(response.headers.get('X-Export-Sizes')))

        const blob = await response.blob()
        if (controller.signal.aborted) return

        const url = URL.createObjectURL(blob)
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

  /** Everything the file depends on, so a held one can be checked against it. */
  const settingsKey = `${picture(caption)}&${
    destination === 'print' ? `resolution=print&paper=${paper}` : `resolution=${destination === 'full' ? 'full' : 'high'}`
  }`

  const filename = () => {
    const parts = [photo.filmStock, photo.camera, look.name]
      .filter(Boolean)
      .map(part => String(part).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''))
    // The photograph's own tail, so a roll does not save thirty-six files under
    // one name for the browser to disambiguate with " (1)", " (2)".
    return `avoidxray-${[...parts, photo.id.slice(-6)].join('-')}.jpg`
  }

  // Abandoned when the dialog closes, and given a deadline of its own.
  useEffect(() => () => inFlight.current?.abort(), [])

  const render = async () => {
    inFlight.current?.abort()
    const controller = new AbortController()
    inFlight.current = controller
    // Generous: a Full export of a large scan is a real wait. Short enough that
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
      // race the download loses on a slow machine — which is exactly the
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
   * step between making an export and posting one.
   *
   * One tap. The Web Share spec consumes the gesture that calls it and WebKit
   * expires one after five seconds, so a slow render used up the tap meant to
   * open the sheet. If the gesture does expire, the finished file is kept and
   * the next press shares it without rendering again.
   */
  const held = useRef<{ file: File; key: string } | null>(null)

  const handleShare = async () => {
    if (working) return
    setActionError(null)

    // Already made, and still describes what is on screen.
    if (held.current?.key === settingsKey) {
      const ready = held.current
      held.current = null
      try {
        await navigator.share({ files: [ready.file] })
      } catch (failure) {
        if (failure instanceof DOMException && failure.name === 'NotAllowedError') {
          held.current = ready
          setActionError('Press Share again to open the share sheet.')
        }
        // A dismissed sheet is not a failure worth reporting.
      }
      return
    }

    setWorking('share')
    try {
      const file = new File([await render()], filename(), { type: 'image/jpeg' })
      try {
        await navigator.share({ files: [file] })
      } catch (failure) {
        if (failure instanceof DOMException && failure.name === 'NotAllowedError') {
          held.current = { file, key: settingsKey }
          setActionError('Press Share again to open the share sheet.')
        }
      }
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
   * for the one action a screen wants from you."
   */
  const pressed = (on: boolean) =>
    [
      focusRing,
      on
        ? 'bg-neutral-800 border-neutral-500 text-white'
        : 'bg-neutral-900/60 border-neutral-800 text-neutral-400 hover:border-neutral-600 hover:text-white',
    ].join(' ')

  /** The catalog line, stated rather than offered as six things to switch off. */
  const credits = [photo.filmStock, photo.camera].filter(Boolean).join(' · ')

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
        // Save sits under the browser chrome.
        className="bg-neutral-900 max-w-5xl w-full max-h-[calc(100dvh-2rem)] overflow-y-auto overscroll-contain focus:outline-none"
      >
        <div className="flex items-start justify-between gap-4 px-5 py-4 border-b border-neutral-800 sticky top-0 bg-neutral-900 z-10">
          <div className="min-w-0">
            <h2 id="export-title" className="text-white font-bold text-lg leading-tight">Export</h2>
            <p className="text-neutral-400 text-sm mt-0.5 truncate">
              {many ? `${photos.length} photographs` : credits || 'Save or share this photograph'}
            </p>
          </div>
          <button
            type="button"
            onClick={requestClose}
            aria-label="Close"
            className={`${iconButtonClass} -mr-2 shrink-0`}
          >
            <svg className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex flex-col lg:flex-row">
          {/* The picture, given the room. It was a fixed box in a column that
              left most of a wide screen as empty black. */}
          <div className="lg:flex-1 p-5 bg-neutral-950 flex flex-col justify-center min-h-[38vh] lg:min-h-[60vh]">
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

            <div className="relative flex items-center justify-center">
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
                  className={`max-w-full max-h-[34vh] lg:max-h-[58vh] object-contain transition-opacity ${loadingPreview ? 'opacity-40' : ''}`}
                />
              )}
              {loadingPreview && previewUrl && (
                <div className="absolute inset-0 flex items-center justify-center" aria-hidden>
                  <span className="flex items-center gap-2 bg-black/75 text-white text-[11px] uppercase tracking-wider font-bold px-3 py-2">
                    <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Rendering
                  </span>
                </div>
              )}
              {error && !loadingPreview && !previewUrl && (
                <p className="px-6 py-16 text-center text-sm text-neutral-400">Could not render this export.</p>
              )}
            </div>

            {/* The file's own measurements. A size that is never asked for is
                still worth stating. */}
            <p className="text-center text-neutral-500 text-[11px] tabular-nums mt-4 h-4">
              {exportSize
                ? destination === 'print'
                  ? `${paperById(paper).name} in · ${exportSize.w} × ${exportSize.h} px · ${sheet?.dpi ?? PRINT_DPI} dpi`
                  : `${exportSize.w} × ${exportSize.h} px`
                : ''}
            </p>

            {/* The set, when there is one. A single photograph has no strip. */}
            {many && (
              <div className="mt-3 flex gap-2 overflow-x-auto pb-1 justify-center">
                {photos.map((p, i) => (
                  <button
                    type="button"
                    key={p.id}
                    onClick={() => setIndex(i)}
                    aria-label={`Photograph ${i + 1} of ${photos.length}`}
                    aria-pressed={i === current}
                    className={`shrink-0 w-11 h-11 border transition-colors ${
                      i === current ? 'border-brand' : 'border-neutral-700 hover:border-neutral-500'
                    }`}
                    style={p.thumbnailPath
                      ? { backgroundImage: `url(${p.thumbnailPath})`, backgroundSize: 'cover', backgroundPosition: 'center' }
                      : undefined}
                  />
                ))}
              </div>
            )}
          </div>

          <div className="lg:w-[22rem] shrink-0 p-5 border-t lg:border-t-0 lg:border-l border-neutral-800 flex flex-col gap-5">
            <div>
              <h3 id={`${fid}-look`} className={sectionLabel}>Look</h3>
              <LookTiles photoId={photo.id} chosen={lookId} onChoose={chooseLook} />
            </div>

            {/* Only a print has paper and lettering. They are states of one
                object, not two more objects. */}
            {lookId === 'print' && (
              <div className="flex flex-wrap gap-x-5 gap-y-3">
                <Pair
                  label="Paper"
                  id={`${fid}-paper`}
                  options={[['White', false], ['Black', true]]}
                  value={dark}
                  onChange={setDark}
                />
                <Pair
                  label="Lettering"
                  id={`${fid}-label`}
                  options={[['On', true], ['Off', false]]}
                  value={labelled}
                  onChange={setLabelled}
                />
              </div>
            )}

            <div>
              <h3 id={`${fid}-to`} className={sectionLabel}>Where it is going</h3>
              <div role="group" aria-labelledby={`${fid}-to`} className="grid grid-cols-3 gap-2">
                {DESTINATIONS.map(d => (
                  <button
                    type="button"
                    key={d.id}
                    onClick={() => setDestination(d.id)}
                    aria-pressed={destination === d.id}
                    className={`px-2 py-2 border transition-colors ${pressed(destination === d.id)}`}
                  >
                    <span className="block text-[13px] font-medium leading-tight">{d.name}</span>
                    <span className="block text-[10px] text-neutral-400 leading-tight mt-0.5">{d.note}</span>
                  </button>
                ))}
              </div>

              {/* Never disabled, and never refused. A scan short of 300dpi is
                  printed at the density it has and the number says so, which is
                  what a lab's order form wants — rather than the old behaviour
                  of greying the control out and turning down 12% of the
                  library. */}
              {destination === 'print' && (
                <div role="group" aria-label="Paper size" className="flex gap-2 mt-2">
                  {PAPERS.map(p => (
                    <button
                      type="button"
                      key={p.id}
                      onClick={() => setPaper(p.id)}
                      aria-pressed={paper === p.id}
                      className={`flex-1 px-2 py-1.5 border text-xs font-medium tabular-nums transition-colors ${pressed(paper === p.id)}`}
                    >
                      {p.name}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* One field, and only for the looks that write. */}
            {prints.caption && (
              <div>
                <h3 className={sectionLabel}>
                  <label htmlFor={`${fid}-caption`}>Written on it</label>
                </h3>
                <input
                  id={`${fid}-caption`}
                  type="text"
                  value={caption}
                  onChange={e => setCaption(e.target.value)}
                  placeholder={lookId === 'instant' ? photo.filmStock ?? 'Leave empty for the film' : 'Leave empty for none'}
                  maxLength={CAPTION_MAX_LENGTH}
                  className={fieldClass}
                />
              </div>
            )}

            {(actionError || error) && <FieldError>{actionError ?? error}</FieldError>}

            {/* aria-busy and a re-entry guard rather than `disabled`. Disabling
                the element that has focus makes the browser drop focus to the
                body, so pressing Save with the keyboard put the cursor nowhere
                and nothing put it back. */}
            <div className="flex gap-2 mt-auto">
              {canShare && (
                <Button onClick={handleShare} aria-busy={working === 'share'} variant="secondary" fullWidth>
                  {working === 'share' ? (
                    <>
                      <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Working
                    </>
                  ) : 'Share'}
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

/**
 * The five looks, each showing this photograph.
 *
 * One request for all of them. The cells are laid out and sized before the
 * strip arrives, so the panel does not move when it lands, and each button
 * carries its name underneath whether or not the picture ever comes — on a
 * refused render or a dead connection this degrades to exactly the named list
 * it replaced, rather than to five empty boxes.
 */
function LookTiles({
  photoId, chosen, onChoose,
}: { photoId: string; chosen: LookId; onChoose: (id: LookId) => void }) {
  const [sheet, setSheet] = useState<string | null>(null)
  const sheetRef = useRef<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    const load = async () => {
      try {
        const response = await fetch(`/api/watermark/sheet?id=${photoId}`, { signal: controller.signal })
        if (!response.ok || controller.signal.aborted) return
        const url = URL.createObjectURL(await response.blob())
        if (controller.signal.aborted) { URL.revokeObjectURL(url); return }
        if (sheetRef.current) URL.revokeObjectURL(sheetRef.current)
        sheetRef.current = url
        setSheet(url)
      } catch {
        // A missing contact sheet leaves named buttons, which still work.
      }
    }
    load()
    return () => controller.abort()
  }, [photoId])

  useEffect(() => () => {
    if (sheetRef.current) URL.revokeObjectURL(sheetRef.current)
  }, [])

  return (
    <div role="group" aria-label="Look" className="grid grid-cols-5 gap-1.5">
      {LOOKS.map((l, i) => (
        <button
          type="button"
          key={l.id}
          onClick={() => onChoose(l.id)}
          aria-pressed={chosen === l.id}
          className={`group text-center ${focusRing}`}
        >
          <span
            aria-hidden
            className={`block w-full aspect-square border bg-neutral-950 transition-colors ${
              chosen === l.id ? 'border-white' : 'border-neutral-800 group-hover:border-neutral-600'
            }`}
            style={sheet ? {
              backgroundImage: `url(${sheet})`,
              // Five cells in one strip: each is a fifth of the width, so the
              // background is stretched to five times the button and stepped
              // across it.
              backgroundSize: `${LOOKS.length * 100}% 100%`,
              backgroundPosition: `${(i / (LOOKS.length - 1)) * 100}% 0`,
            } : undefined}
          />
          <span
            className={`block text-[10px] leading-tight mt-1 transition-colors ${
              chosen === l.id ? 'text-white' : 'text-neutral-500 group-hover:text-neutral-300'
            }`}
          >
            {l.name}
          </span>
        </button>
      ))}
    </div>
  )
}

/** Two states of one thing, in the panel's own selection vocabulary. */
function Pair<T>({
  label, id, options, value, onChange,
}: {
  label: string
  id: string
  options: [string, T][]
  value: T
  onChange: (v: T) => void
}) {
  return (
    <div>
      <span id={id} className="block text-neutral-500 text-[10px] uppercase tracking-wider mb-1.5">{label}</span>
      <div role="group" aria-labelledby={id} className="inline-flex border border-neutral-800">
        {options.map(([name, option]) => (
          <button
            type="button"
            key={name}
            onClick={() => onChange(option)}
            aria-pressed={value === option}
            className={`px-3 py-1 text-[11px] uppercase tracking-wide font-medium transition-colors ${focusRing} ${
              value === option ? 'bg-neutral-800 text-white' : 'text-neutral-500 hover:text-white'
            }`}
          >
            {name}
          </button>
        ))}
      </div>
    </div>
  )
}
