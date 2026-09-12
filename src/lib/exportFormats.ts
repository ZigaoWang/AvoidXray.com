/**
 * The export's size table, shared by the dialog and the render route.
 *
 * Both sides need this: the route to size the canvas, the dialog to know which
 * resolutions a photograph can actually fill and what to print under the
 * control. It lived in both files as two independent copies, which is the
 * arrangement src/lib/catalogWire.ts exists to avoid — add a format to one copy
 * and the other returns a 200 with the wrong image.
 *
 * Nothing here may import sharp, fs or the database: it is bundled for the
 * browser.
 */

export type ExportFormat = 'square' | 'post' | 'classic' | 'frame' | 'story' | 'original'
export type ExportStyle = 'bare' | 'clean' | 'sprocket' | 'negative' | 'slide'
export type Resolution = 'web' | 'high' | 'max'
/** The paper an export is printed on. Declared once; the dialog had its own. */
export type ExportTheme = 'light' | 'dark'

export const EXPORT_STYLES: readonly ExportStyle[] = ['bare', 'clean', 'sprocket', 'negative', 'slide']
export const EXPORT_FORMATS: readonly ExportFormat[] = ['square', 'post', 'classic', 'frame', 'story', 'original']

export function isExportStyle(value: string | null): value is ExportStyle {
  return EXPORT_STYLES.includes(value as ExportStyle)
}

export function isExportFormat(value: string | null): value is ExportFormat {
  return EXPORT_FORMATS.includes(value as ExportFormat)
}

export function isExportTheme(value: string | null): value is ExportTheme {
  return value === 'light' || value === 'dark'
}

export function isResolution(value: string | null): value is Resolution {
  return value === 'web' || value === 'high' || value === 'max'
}

/**
 * Where the export is going. The canvas is decided before anything is rendered,
 * which is the whole difference from the old path: it fetched a 6000px, 50MB
 * scan across the Pacific, composited at 25 megapixels, encoded a full-size PNG
 * and only then shrank it to a preview.
 */
export const CANVAS: Record<Exclude<ExportFormat, 'original'>, { w: number; h: number }> = {
  /** 6x6, and a feed post that fills a square. */
  square: { w: 1080, h: 1080 },
  /** 4:5. The tallest a feed will keep, and 8x10 on paper. */
  post: { w: 1080, h: 1350 },
  /** 4:3. 645, and most digital scanning backs. */
  classic: { w: 1080, h: 1440 },
  /** 3:2. What a 35mm frame actually is, and what a 4x6 print is. */
  frame: { w: 1080, h: 1620 },
  /** 9:16. A story, and 16:9 turned on its side. */
  story: { w: 1080, h: 1920 },
}

/**
 * The shape the photograph was actually taken at, where the catalog knows it.
 *
 * This is the difference between a border tool and this one. A frame shot on a
 * Hasselblad is square and a 35mm frame is 3:2, and the export should open at
 * the picture's own proportions rather than at whichever ratio a social network
 * happens to prefer this year. Everything else remains one tap away.
 *
 * Matched on the format string the catalog stores on a film stock. Anything
 * unrecognised falls back to 3:2, which is what most of the library is.
 */
export function nativeFormat(
  filmFormat: string | null | undefined,
  srcW?: number,
  srcH?: number,
): Exclude<ExportFormat, 'original'> {
  const value = (filmFormat || '').toLowerCase().replace(/[\s_-]/g, '')

  // A stated frame geometry wins, because it says what the camera actually
  // exposes rather than what the scan happened to be cropped to.
  if (/6x6|6×6|square/.test(value)) return 'square'
  if (/645|6x45|6×45/.test(value)) return 'classic'
  // 4x5 and 8x10 sheet film are 5:4, which is the post canvas turned on its side.
  if (/4x5|4×5|8x10|8×10|5x4/.test(value)) return 'post'
  // 6x7 is 7:6, nearer a square than anything else on the list.
  if (/6x7|6×7|6x8|6×8/.test(value)) return 'square'
  if (/halfframe|halfframe/.test(value)) return 'classic'

  // Otherwise the photograph's own proportions decide.
  //
  // The catalog's format columns are not the answer they look like: a film
  // stock's is the list of gauges it is *sold* in ("35mm, 120"), not the frame
  // this picture came from, and a camera's says "Medium Format (120/220)",
  // which is 6x6, 6x7 and 645 at once. Matching those against frame geometries
  // sent every medium-format photograph to 3:2, the one ratio no 120 camera
  // produces.
  //
  // The scan's own shape is the one fact that is always present and always
  // true, so the nearest canvas to it is the honest default. 35mm lands on 3:2
  // by arithmetic rather than by a string match.
  if (srcW && srcH) {
    const aspect = Math.max(srcW, srcH) / Math.min(srcW, srcH)
    let nearest: Exclude<ExportFormat, 'original'> = 'frame'
    let best = Infinity
    for (const name of Object.keys(CANVAS) as Exclude<ExportFormat, 'original'>[]) {
      const { w, h } = CANVAS[name]
      const distance = Math.abs(Math.max(w, h) / Math.min(w, h) - aspect)
      if (distance < best) { best = distance; nearest = name }
    }
    return nearest
  }

  return 'frame'
}

/** Long edge for the "as shot" format, which keeps the photograph's own ratio. */
export const ORIGINAL_LONG_EDGE = 1600

/** Long edge of the stored medium variant. See src/lib/image.ts. */
export const MEDIUM_LONG_EDGE = 1600

/**
 * Longest caption the export will set.
 *
 * The dialog's field has always stopped at this, but the route accepted any
 * length and the renderer draws the whole string before measuring it to decide
 * whether to shorten it. Two thousand characters asks Cairo for a surface some
 * 35,000px wide, which it refuses, and the export came back as a 500. The limit
 * belongs on both sides and therefore here.
 */
export const CAPTION_MAX_LENGTH = 50

/**
 * How large the export is rendered, as a whole multiple of the canvases above.
 *
 * Those canvases are sized for a feed, where 1080 is as much as the platform
 * will keep. An exported file is not only a post, though — it goes on a blog,
 * to a friend, or to a lab — and pinning every download at 1080 threw away most
 * of what the photograph held. The median scan on the site is 3283x2220.
 *
 * A multiple rather than a free pixel size, because every renderer derives its
 * margins, type and geometry from the canvas width as a fraction of it. Scaling
 * the canvas scales all of that with it, so a larger export is the same
 * composition at a higher resolution rather than a different one.
 */
export const RESOLUTION = { web: 1, high: 2, max: 3 } as const

/**
 * Whether a format has a long side at all, and so can be turned on its side.
 *
 * A square does not, and "as shot" already takes the photograph's own shape.
 */
export function canTurn(format: ExportFormat): boolean {
  if (format === 'original') return false
  return CANVAS[format].w !== CANVAS[format].h
}

/**
 * The canvas for a format, at a render scale, in the given orientation.
 *
 * Every canvas above is written upright because they were sized for a feed.
 * Two thirds of the photographs on the site are not: measured over the whole
 * library, 696 of 1076 are landscape, and each one of those was being fitted
 * into a standing frame with the mat taking up the difference. The ratio is the
 * format; which way round it lies is the photograph's business.
 */
export function canvasOf(format: Exclude<ExportFormat, 'original'>, scale: number, landscape = false) {
  const { w, h } = CANVAS[format]
  const long = Math.max(w, h) * scale
  const short = Math.min(w, h) * scale
  return landscape ? { w: long, h: short } : { w: short, h: long }
}

/** The largest dimension this export will actually draw. */
export function targetLongEdge(format: ExportFormat, scale: number): number {
  if (format === 'original') return ORIGINAL_LONG_EDGE * scale
  const { w, h } = canvasOf(format, scale)
  return Math.max(w, h)
}

/**
 * The largest scale this photograph can fill without being enlarged.
 *
 * Enlarging a scan does not add anything to it; it only makes a bigger file
 * that is no sharper, which is the kind of number a product should not print
 * next to a download button. So the steps a photograph cannot actually fill are
 * not offered, and the export stops at the one it can.
 */
export function maxScale(format: ExportFormat, srcW: number, srcH: number): number {
  // "As shot" gets the same test as the rest. Exempting it meant every step was
  // offered for every photograph, and since its canvas is clamped to the source
  // (min(1, ...) in canvasBase) the extra steps rendered an identical file — an
  // offered size that could not be filled, which is the exact thing this is
  // here to prevent. It also made the size reported to the dialog wrong, since
  // that assumes the canvas really does grow with the scale.
  const source = Math.max(srcW, srcH)
  let best: number = RESOLUTION.web
  for (const scale of [RESOLUTION.web, RESOLUTION.high, RESOLUTION.max]) {
    if (targetLongEdge(format, scale) <= source) best = scale
  }
  return best
}

/** The resolutions this photograph can fill, largest last. */
export function availableResolutions(format: ExportFormat, srcW: number, srcH: number): Resolution[] {
  const ceiling = maxScale(format, srcW, srcH)
  return (Object.keys(RESOLUTION) as Resolution[]).filter(name => RESOLUTION[name] <= ceiling)
}

/**
 * What each style actually prints, so nothing offers a control it ignores.
 *
 * Checked against the renderers in src/lib/watermark/render.ts: camera in
 * renderClean and renderSlide, film in renderClean, renderSprocket and
 * renderSlide, username in renderClean and renderSprocket, date in renderClean
 * and renderSlide.
 *
 * Lives here rather than in the dialog because it describes the renderer, not
 * the form — it is the server's truth about which parameters reach pixels, and
 * the dialog is only its first reader.
 */
export type StylePrints = {
  caption: boolean; camera: boolean; film: boolean
  username: boolean; date: boolean; qr: boolean; paper: boolean; mat: boolean
}

export const STYLE_PRINTS: Record<ExportStyle, StylePrints> = {
  bare:     { caption: false, camera: false, film: false, username: false, date: false, qr: false, paper: true, mat: true },
  clean:    { caption: true,  camera: true,  film: true,  username: true,  date: true,  qr: true,  paper: true, mat: false },
  sprocket: { caption: false, camera: false, film: true,  username: true,  date: false, qr: false, paper: true, mat: false },
  negative: { caption: false, camera: false, film: true,  username: true,  date: false, qr: false, paper: true, mat: false },
  slide:    { caption: true,  camera: false, film: true,  username: false, date: true,  qr: false, paper: true, mat: false },
}

export type LookId = 'bare' | 'print' | 'darkroom' | 'filmstrip' | 'negative' | 'slide'

/**
 * A finished thing you can name, rather than a matrix you assemble.
 *
 * Five styles times four formats times two papers times six toggles is 2,560
 * combinations, a number nobody wants to be handed. Most are uninteresting and
 * a few are wrong. A look is one of the half-dozen results worth having, and
 * carries what it needs: the renderer to use, the paper it wants, and — the
 * part that matters — the formats it can honestly produce.
 *
 * Everything a look sets remains adjustable underneath. It decides where you
 * start, not where you may end up.
 */
export interface Look {
  id: LookId
  name: string
  note: string
  style: ExportStyle
  theme: ExportTheme
  /**
   * Where the size control starts. Null means the photograph's own ratio —
   * which is the right answer for any look that is a print of the frame rather
   * than an object built around it.
   */
  format: ExportFormat | null
  /** Photograph size for the styles that mat it, 0-100. */
  mat?: number
}

export const LOOKS: readonly Look[] = [
  { id: 'print',     name: 'Print',     note: 'Gallery white', style: 'clean',    theme: 'light', format: null },
  { id: 'darkroom',  name: 'Darkroom',  note: 'Gallery black', style: 'clean',    theme: 'dark',  format: null },
  { id: 'bare',      name: 'Bare',      note: 'No lettering',  style: 'bare',     theme: 'light', format: null, mat: 55 },
  { id: 'filmstrip', name: 'Filmstrip', note: 'Full width',    style: 'sprocket', theme: 'light', format: 'original' },
  { id: 'negative',  name: 'Negative',  note: 'Orange mask',   style: 'negative', theme: 'dark',  format: 'original' },
  { id: 'slide',     name: 'Slide',     note: 'Mounted',       style: 'slide',    theme: 'light', format: 'square' },
]

export function lookById(id: LookId): Look {
  return LOOKS.find(look => look.id === id) ?? LOOKS[0]
}
