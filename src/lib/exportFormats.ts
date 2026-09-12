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

export type ExportFormat = 'post' | 'square' | 'story' | 'original'
export type ExportStyle = 'bare' | 'clean' | 'sprocket' | 'negative' | 'slide'
export type Resolution = 'web' | 'high' | 'max'

export const EXPORT_STYLES: readonly ExportStyle[] = ['bare', 'clean', 'sprocket', 'negative', 'slide']
export const EXPORT_FORMATS: readonly ExportFormat[] = ['post', 'square', 'story', 'original']

export function isExportStyle(value: string | null): value is ExportStyle {
  return EXPORT_STYLES.includes(value as ExportStyle)
}

export function isExportFormat(value: string | null): value is ExportFormat {
  return EXPORT_FORMATS.includes(value as ExportFormat)
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
  post: { w: 1080, h: 1350 },
  square: { w: 1080, h: 1080 },
  story: { w: 1080, h: 1920 },
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
  if (format === 'original') return RESOLUTION.max
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
