import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
// sharp 0.35 dropped the `sharp.X` type namespace in favor of named type
// exports; the runtime default export is unchanged.
import sharp from 'sharp'
import { bylineUserSelect } from '@/lib/publicUser'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { canViewPhoto } from '@/lib/photoVisibility'
import { SHARP_INPUT } from '@/lib/sharpConfig'
import { clientIp, enforceLimit } from '@/lib/rateLimit'
import { LIMITS } from '@/lib/rateLimitPolicy'
import { asInt } from '@/lib/requestBody'
import { displayName } from '@/lib/seo/alt'
import { filmTypeLabel } from '@/lib/filmFields'
import { renderExport, sprocketStrip, drawnLongEdge, SPROCKET_SHEET_MARGIN } from '@/lib/watermark/render'

import {
  CAPTION_MAX_LENGTH,
  MEDIUM_LONG_EDGE,
  ORIGINAL_LONG_EDGE,
  canvasOf,
  scaleFor,
  isExportFormat,
  isExportStyle,
  isExportTheme,
  isResolution,
  availableResolutions,
  maxScale,
  type ExportFormat,
  type ExportStyle,
  type ExportTheme,
  type Resolution,
} from '@/lib/exportFormats'

export type { ExportFormat, ExportStyle }

/**
 * Sources already fetched, held briefly in memory.
 *
 * The dialog renders a preview per option change, and each one re-fetched the
 * same object from storage: measured from the app server, 1.10s for a 278KB
 * medium, repeatable, with 0.70s of that time to first byte. The bucket is in
 * Hong Kong and this box is not. That single fetch cost roughly four times the
 * whole render, so the interaction was spending its time on bytes it had
 * already seen rather than on anything it was doing.
 *
 * Bounded by total bytes rather than by entry count, because the two things
 * stored here differ by an order of magnitude — a medium is a few hundred
 * kilobytes and an original averages 8.9MB — and a count would let a handful of
 * originals take far more of a 2GB machine than this is worth.
 *
 * In-process, so it is correct only while this runs as a single pm2 fork. That
 * is already true of the rate limiter in src/lib/rateLimit.ts, and the failure
 * mode here is a cache miss rather than a wrong answer.
 */
const SOURCE_CACHE_LIMIT = 48 * 1024 * 1024
const SOURCE_CACHE_TTL_MS = 5 * 60 * 1000

const sourceCache = new Map<string, { buffer: Buffer; at: number }>()
let sourceCacheBytes = 0

function drop(url: string) {
  const held = sourceCache.get(url)
  if (!held) return
  sourceCache.delete(url)
  sourceCacheBytes -= held.buffer.byteLength
}

async function fetchImage(url: string): Promise<Buffer> {
  const held = sourceCache.get(url)
  if (held) {
    if (Date.now() - held.at <= SOURCE_CACHE_TTL_MS) {
      // Re-inserted so Map iteration order stays least-recently-used first,
      // which is the order eviction below walks.
      sourceCache.delete(url)
      sourceCache.set(url, held)
      return held.buffer
    }
    drop(url)
  }

  // Storage is far enough away that a stalled connection would otherwise hold
  // the request open indefinitely; ogCard.tsx takes the same precaution. Set
  // well clear of a real fetch rather than close to it: the largest original on
  // the site is 47MB and the bucket serves 6-7MB/s measured, so a fast one is
  // already seven seconds and a slow moment must not read as a broken export.
  const response = await fetch(url, { signal: AbortSignal.timeout(45_000) })
  if (!response.ok) throw new Error(`Failed to fetch image: ${response.status}`)
  const buffer = Buffer.from(await response.arrayBuffer())

  if (buffer.byteLength <= SOURCE_CACHE_LIMIT) {
    // Dropped first: two requests can miss on the same url at once, and
    // overwriting the entry without this would count its bytes twice.
    drop(url)
    sourceCache.set(url, { buffer, at: Date.now() })
    sourceCacheBytes += buffer.byteLength
    for (const oldest of sourceCache.keys()) {
      if (sourceCacheBytes <= SOURCE_CACHE_LIMIT) break
      if (oldest !== url) drop(oldest)
    }
  }

  return buffer
}

/**
 * How many exports may be composited at once, and how many may wait.
 *
 * The rate limit in src/lib/rateLimitPolicy.ts is a rate, not a bound on what
 * is in flight: an allowance of N in five minutes permits N at the same
 * instant. That was survivable while every export was a 1080px canvas. It is
 * not now that a caller can ask for three times that in each direction —
 * measured by sampling RSS through a real render, one sprocket export at the
 * largest size peaks around 560MB above its baseline against 36MB at the
 * smallest, and this box has 2GB with Postgres beside it and, in
 * sharpConfig.ts's own words, "no memory headroom to absorb" a large decode.
 * Two of those at once is most of the machine, which is why it is two and not
 * more, and why the source fetch happens inside the slot rather than before.
 *
 * Two slots on three cores leaves one for the rest of the site, which still has
 * pages to serve while somebody is exporting. Past the queue the honest answer
 * is 503 with a Retry-After rather than accepting work that will either take
 * minutes or take the process down with it.
 */
const RENDER_SLOTS = 2
const RENDER_QUEUE_LIMIT = 8

let rendersInFlight = 0
const waitingForSlot: (() => void)[] = []

class Saturated extends Error {}

/** The caller went away before the work began. Not an error to report. */
class Abandoned extends Error {}

/**
 * Past this, a render holds the whole machine rather than half of it.
 *
 * Measured on real scans: a gallery print at the photograph's own resolution
 * runs to 61-64 megapixels for the largest frames here and peaks around 1.2GB
 * of resident memory. Two at once is more than a 2GB box with Postgres on it
 * has, and the point of a size called "Full" is that it is not capped -- so the
 * bound moves from the size of the render to how many of them run together.
 */
const HEAVY_MEGAPIXELS = 24

/** Roughly how many megapixels a sheet comes to, before rendering one. */
function megapixelsOf(
  format: ExportFormat, scale: number, landscape: boolean, srcW: number, srcH: number,
): number {
  if (format === 'original') {
    const fit = Math.min(1, (ORIGINAL_LONG_EDGE * scale) / Math.max(srcW, srcH))
    return (srcW * fit * srcH * fit) / 1e6
  }
  const { w, h } = canvasOf(format, scale, landscape)
  return (w * h) / 1e6
}

async function withRenderSlot<T>(exclusive: boolean, work: () => Promise<T>): Promise<T> {
  // The slot is handed from one holder straight to the next, rather than
  // released for whoever happens to be running.
  //
  // Decrementing and then waking a waiter leaves a gap: a request arriving in
  // that moment finds a free slot and takes it, so it overtakes callers that
  // have been parked since before it existed, and a woken waiter that loses
  // that race has to queue again — past the queue limit, since it is already
  // counted out of it. Transferring the count with the turn removes the gap
  // entirely, and makes the queue what it claims to be: first come, first
  // served, with a real bound on its length.
  // A heavy render takes every slot, so nothing else composites beside it.
  const wanted = exclusive ? RENDER_SLOTS : 1

  const free = rendersInFlight + wanted <= RENDER_SLOTS && waitingForSlot.length === 0
  if (!free) {
    if (waitingForSlot.length >= RENDER_QUEUE_LIMIT) throw new Saturated()
    // Woken by a holder releasing; the count is not transferred for a heavy
    // caller, since it needs more than the one turn being handed over, so it
    // re-checks and waits again until the machine is genuinely clear.
    while (rendersInFlight + wanted > RENDER_SLOTS) {
      await new Promise<void>(resolve => waitingForSlot.push(resolve))
    }
  }
  rendersInFlight += wanted

  try {
    return await work()
  } finally {
    rendersInFlight -= wanted
    // Everyone waiting gets a look, because what just freed up may be enough
    // for a light caller and not for a heavy one.
    for (const waiter of waitingForSlot.splice(0)) waiter()
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const photoId = searchParams.get('id')
  const isPreview = searchParams.get('preview') === '1'

  const styleParam = searchParams.get('style')
  const style: ExportStyle = isExportStyle(styleParam) ? styleParam : 'clean'
  const formatParam = searchParams.get('format')
  const format: ExportFormat = isExportFormat(formatParam) ? formatParam : 'post'
  const themeParam = searchParams.get('theme')
  const theme: ExportTheme = isExportTheme(themeParam) ? themeParam : 'light'

  const showCamera = searchParams.get('showCamera') !== '0'
  const showFilm = searchParams.get('showFilm') !== '0'
  const showUsername = searchParams.get('showUsername') !== '0'
  const showDate = searchParams.get('showDate') === '1'
  const showQR = searchParams.get('showQR') === '1'
  const showCaption = searchParams.get('showCaption') !== '0'
  const customDate = searchParams.get('customDate') || ''
  // No default. It used to invent "Shot on film" when the parameter was absent,
  // which is filler written across somebody else's photograph — and the dialog
  // always sends the field, empty included, so the only thing the default ever
  // reached was a bare call to this route.
  const customCaption = (searchParams.get('caption') ?? '').slice(0, CAPTION_MAX_LENGTH)
  const matWidth = Math.min(100, Math.max(0, asInt(searchParams.get('mat')) ?? 45))
  const resolutionParam = searchParams.get('resolution')
  const resolution: Resolution = isResolution(resolutionParam) ? resolutionParam : 'web'
  // Absent means upright, which is what every canvas was before this existed.
  const landscape = searchParams.get('landscape') === '1'
  // Absent means the plain cut, which is the quieter of the two under a
  // photograph. It used to be chosen from the paper, which always gave the
  // heavier one on a white print.
  const invertMark = searchParams.get('invertMark') === '1'
  // Off unless asked. Cropping somebody's photograph without being asked is a
  // worse answer than paper down the sides.
  const fill = searchParams.get('fill') === '1'

  const baseUrl = process.env.NEXTAUTH_URL || 'https://avoidxray.com'

  if (!photoId) {
    return NextResponse.json({ error: 'Photo ID required' }, { status: 400 })
  }

  // Checked before the photo is even looked up: the cost this protects is the
  // render below, and a rejected caller should not reach the database either.
  const limited = enforceLimit(
    'watermark', clientIp(req.headers), LIMITS.watermark.perIp,
    'Too many exports from this connection.'
  )
  if (limited) return limited

  const photo = await prisma.photo.findUnique({
    where: { id: photoId },
    include: { camera: true, filmStock: true, user: { select: bylineUserSelect } }
  })

  // The export reads a stored variant of the photograph, so it has to answer
  // the same question /photos/[id] does. Checking `published` alone still let
  // anyone holding the id render a PRIVATE photo. canViewPhoto covers both:
  // drafts are refused, and a private photo is rendered only for its owner.
  const session = await getServerSession(authOptions)
  const viewerId = (session?.user as { id?: string } | undefined)?.id ?? null

  if (!photo || !canViewPhoto(photo, viewerId)) {
    return NextResponse.json({ error: 'Photo not found' }, { status: 404 })
  }

  try {
    // The source is chosen by what the export will actually draw.
    //
    // Reading the original unconditionally is the obvious way to stop capping
    // quality, and it is the wrong one: measured against this bucket, the
    // originals run to 34MB and throughput is 6-7MB/s, so it adds seconds to a
    // download whose canvas may be 1080px wide and cannot use the detail. The
    // medium is 1600px (src/lib/image.ts), which already covers every export up
    // to that size, and it is thirty times smaller.
    //
    // So the original is fetched when the export is genuinely larger than the
    // medium can fill, and not otherwise. A viewer asking for a big file waits
    // for a big file; nobody else pays for it.
    //
    // The photograph's own dimensions, from the row rather than from the file.
    //
    // Asking sharp is the obvious way and it is wrong: .rotate() is autoOrient,
    // but metadata() on that pipeline still reports the *stored* pair. Verified
    // on the installed sharp 0.35.4 — a 600x400 JPEG tagged EXIF orientation 6
    // reports 600x400, reports autoOrient 400x600, and draws 400x600. Anything
    // reading width and height off it has the axes the wrong way round.
    //
    // That is not a corner case here: the medium is re-encoded from an already
    // rotated buffer (src/lib/image.ts:181) and carries no tag, while the
    // stored original comes back byte-for-byte when the upload has no GPS
    // (image.ts:137), tag intact. So the preview, which reads the medium, was
    // right and the download, which reads the original, was turned on its side
    // — the filmstrip skipped its rotation and then force-filled a 2:3 picture
    // into a 3:2 frame, which fit:'fill' cannot refuse.
    //
    // These columns are measured post-rotate at image.ts:163-166 and do not
    // depend on which variant this request happened to fetch. The handler
    // already trusts them for maxScale above.
    const srcW = photo.width
    const srcH = photo.height

    // The scale is settled from the stored dimensions rather than from the
    // fetched image, since those describe the photograph itself and do not
    // change with the variant this ends up reading.
    const ceiling = maxScale(format, photo.width, photo.height, landscape, fill)
    const downloadScale = Math.min(scaleFor(resolution, format, ceiling), ceiling)
    const scale = isPreview ? 1 : downloadScale

    // A preview reads the medium whatever size was asked for. It is shown a few
    // hundred pixels wide and replaced on the next click, so pulling an original
    // across the Pacific to build one is spending seconds on something nobody
    // looks at closely. Story is the case that made this visible: its canvas is
    // 1920 tall, over the medium's 1600, so every Story preview was fetching a
    // full original to draw a thumbnail.
    //
    // What the photograph will actually be drawn at, not the size of the sheet.
    //
    // The sheet is the wrong question in both directions. A Frame print is 1620
    // tall, over the medium's 1600, while the photograph inside it is fitted
    // into about 988x1340 — so every Frame download fetched an eight-megabyte
    // original to contribute nothing, and Frame is the default size for a 3:2
    // scan. In the other direction a panoramic filmstrip draws a 2859px strip
    // on a sheet that asks for 1600, and was handed the medium to enlarge.
    const drawn = drawnLongEdge(style, format, scale, landscape, matWidth, srcW, srcH)
    const needsOriginal = !isPreview && drawn > MEDIUM_LONG_EDGE
    const sourceUrl = needsOriginal ? photo.originalPath : photo.mediumPath

    // displayName rather than the bare name column, which is what every other
    // surface on the site prints. A camera stored as name='F4', brand='Nikon'
    // was exported as "F4" while the page title beside it read "Nikon F4".
    const camera = showCamera ? (displayName(photo.camera) || '') : ''
    const film = showFilm ? (displayName(photo.filmStock) || '') : ''
    const username = showUsername ? photo.user.username : ''

    let date = ''
    if (showDate) {
      // The photograph's own date, or the one the viewer typed. Never the row's
      // createdAt, which is when the file was uploaded: ticking "Show date" on
      // an undated frame printed today across a picture shot years ago, while
      // the date field beside the toggle sat visibly empty.
      const when = customDate
        ? new Date(customDate + 'T00:00:00Z')
        : photo.takenDate
          ? new Date(photo.takenDate)
          : null
      if (when && !Number.isNaN(when.getTime())) {
        date = when.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' })
      }
    }


    // The fetch is inside the slot, not before it.
    //
    // Held outside, ten callers — two rendering and eight queued — could each
    // be holding a full original at the same time, which the originals here
    // reach 47MB of. That is several hundred megabytes of buffers on a 2GB box,
    // entirely outside the bound the semaphore exists to advertise. The
    // eleventh caller paid the whole Hong Kong transfer and was then turned
    // away as saturated, which made the 503's "the work was never started"
    // false for much the most expensive half of it.
    // Nothing is started for a caller who has already gone.
    //
    // The dialog aborts its in-flight preview on every option change, and the
    // route knew nothing about it: the fetch, the composite and the encode all
    // ran to completion for an image whose reader had left, while holding one
    // of two render slots. Checking on the way in, and again once a slot comes
    // free, turns a superseded preview into almost no work at all.
    if (req.signal.aborted) return new NextResponse(null, { status: 499 })

    // Alone, when the sheet is large enough to matter.
    //
    // Measured on real scans: a gallery print at the photograph's own
    // resolution is 61-64 megapixels for the biggest frames here and peaks
    // around 1.2GB. Two of those at once is more than this machine has, so past
    // a threshold a render takes both slots rather than one.
    const heavy = !isPreview && megapixelsOf(format, downloadScale, landscape, srcW, srcH) > HEAVY_MEGAPIXELS

    const output = await withRenderSlot(heavy, async () => {
      if (req.signal.aborted) throw new Abandoned()
      return renderExport({
        photo: sharp(await fetchImage(sourceUrl), SHARP_INPUT).rotate(),
        seed: photoId,
        mat: matWidth,
        filmFormat: (Array.isArray(photo.filmStock?.format)
          ? photo.filmStock?.format[0]
          : photo.filmStock?.format) || '35mm',
        filmKind: (showFilm && photo.filmStock
          ? filmTypeLabel(photo.filmStock.chromaticity, photo.filmStock.polarity)
          : null) || '',
        // Loaded on every render before this and read for exactly two fields.
        // The speed, the maker's ink and whether there is an orange mask at all
        // are the difference between a photograph of a particular film and a
        // border with a name printed on it.
        stock: {
          iso: photo.filmStock?.iso ?? null,
          // Brand and name together, because the brand column is empty for a
          // good part of the catalog while the name almost always leads with
          // the maker -- "Kodak Gold 200", "LomoChrome Color '92". Matching on
          // the column alone would put Kodak's ink on a Lomography strip.
          brand: [photo.filmStock?.brand, photo.filmStock?.name].filter(Boolean).join(' '),
          monochrome: photo.filmStock?.chromaticity === 'MONOCHROME',
        },
        srcW,
        srcH,
        style,
        format,
        scale,
        landscape,
        invertMark,
        print: resolution === 'print',
        fill,
        theme,
        caption: showCaption ? customCaption.trim() : '',
        camera,
        film,
        username,
        date,
        qrUrl: showQR ? `${baseUrl}/photos/${photoId}` : null,
        // The preview is the same render at a lower quality, rather than a
        // separate and more expensive path.
        quality: isPreview ? 82 : 95,
      })
    })

    // What the file measures at every size it could be asked for, from this one
    // render. Taken from the rendered image rather than recomputed, because each
    // style decides its own canvas — a slide mount is square whatever the format
    // says — and a second copy of that arithmetic in the client is the thing
    // src/lib/exportFormats.ts was written to stop.
    //
    // All of them rather than just the chosen one, because a preview is always
    // drawn at web scale: asking for a different resolution changed nothing
    // about the preview and re-rendered it anyway, spending a slot and a
    // rate-limit hit to return the same pixels. With every size reported, the
    // resolution control stops needing the server at all.
    //
    // Every renderer derives its geometry as a fraction of the canvas, so
    // stepping by the ratio is exact to within rounding.
    const rendered = await sharp(output).metadata()

    /**
     * What this export measures at a given scale.
     *
     * Stepping the rendered size by the ratio of the scales assumes every
     * canvas grows linearly, and one does not: the filmstrip's width is capped
     * by the photograph, so on the "as shot" sheet — which is where Filmstrip
     * and Negative both open — doubling the resolution does not double the
     * sheet. Extrapolating there advertised a file up to 47% larger than the
     * one it then handed over. sprocketStrip is the renderer's own arithmetic,
     * asked rather than guessed at.
     */
    const measure = (at: number) => {
      const strip = (style === 'sprocket' || style === 'negative') && format === 'original'
        ? sprocketStrip(at, srcW, srcH).upright
        : null
      if (strip) {
        const grown = 1 + SPROCKET_SHEET_MARGIN * 2
        return { w: Math.round(strip.w * grown), h: Math.round(strip.h * grown) }
      }
      const step = at / scale
      return {
        w: Math.round((rendered.width || 0) * step),
        h: Math.round((rendered.height || 0) * step),
      }
    }

    const sizes = availableResolutions(format, photo.width, photo.height, landscape, fill)
      .map(name => {
        const { w, h } = measure(scaleFor(name, format, ceiling))
        return `${name}=${w}x${h}`
      })
      .join(',')

    return new NextResponse(new Uint8Array(output), {
      headers: {
        'Content-Type': 'image/jpeg',
        'Content-Disposition': isPreview ? 'inline' : `attachment; filename="avoidxray-${photoId}-${format}.jpg"`,
        'Cache-Control': isPreview ? 'private, max-age=60' : 'no-store',
        'X-Export-Sizes': sizes,
      }
    })
  } catch (error) {
    // Saturation is a queue depth, not a failure of this request: the work was
    // never started, so say so and give a time to come back rather than
    // reporting it as a broken export.
    // The dialog supersedes its own previews constantly; this is the normal
    // end of one, not a failure worth logging.
    if (error instanceof Abandoned) return new NextResponse(null, { status: 499 })

    if (error instanceof Saturated) {
      return NextResponse.json(
        { error: 'Too many exports are being generated right now.' },
        { status: 503, headers: { 'Retry-After': '5' } }
      )
    }
    console.error('Export generation error:', error)
    return NextResponse.json({ error: 'Failed to generate the export' }, { status: 500 })
  }
}
