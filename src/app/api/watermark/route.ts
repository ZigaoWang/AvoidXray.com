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
import { renderExport } from '@/lib/watermark/render'

import {
  CAPTION_MAX_LENGTH,
  MEDIUM_LONG_EDGE,
  RESOLUTION,
  isExportFormat,
  isExportStyle,
  isExportTheme,
  isResolution,
  maxScale,
  targetLongEdge,
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
  // the request open indefinitely; ogCard.tsx takes the same precaution.
  const response = await fetch(url, { signal: AbortSignal.timeout(15_000) })
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
 * is in flight: forty requests in five minutes permits forty at the same
 * instant. That was survivable while every export was a 1080px canvas. It is
 * not now that a caller can ask for three times that in each direction —
 * measured, one sprocket export at the largest size peaks near 500MB against
 * 181MB at the smallest, and this box has 2GB with Postgres beside it and, in
 * sharpConfig.ts's own words, "no memory headroom to absorb" a large decode.
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

async function withRenderSlot<T>(work: () => Promise<T>): Promise<T> {
  if (rendersInFlight >= RENDER_SLOTS && waitingForSlot.length >= RENDER_QUEUE_LIMIT) {
    throw new Saturated()
  }
  // A loop rather than a single wait: being handed the slot and taking it are
  // two separate turns, so another caller can arrive in between.
  while (rendersInFlight >= RENDER_SLOTS) {
    await new Promise<void>(resolve => waitingForSlot.push(resolve))
  }

  rendersInFlight++
  try {
    return await work()
  } finally {
    rendersInFlight--
    waitingForSlot.shift()?.()
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
  const customCaption = (searchParams.get('caption') ?? 'Shot on film').slice(0, CAPTION_MAX_LENGTH)
  const matWidth = Math.min(100, Math.max(0, asInt(searchParams.get('mat')) ?? 45))
  const resolutionParam = searchParams.get('resolution')
  const resolution: Resolution = isResolution(resolutionParam) ? resolutionParam : 'web'
  // Absent means upright, which is what every canvas was before this existed.
  const landscape = searchParams.get('landscape') === '1'

  const baseUrl = process.env.NEXTAUTH_URL || 'https://avoidxray.com'

  if (!photoId) {
    return NextResponse.json({ error: 'Photo ID required' }, { status: 400 })
  }

  // Checked before the photo is even looked up: the cost this protects is the
  // render below, and a rejected caller should not reach the database either.
  const limited = enforceLimit(
    'watermark', clientIp(req.headers), LIMITS.watermark.perIp,
    'Too many exports. Please wait a moment and try again.'
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
    // The scale is settled from the stored dimensions rather than from the
    // fetched image, since those describe the photograph itself and do not
    // change with the variant this ends up reading.
    const downloadScale = Math.min(RESOLUTION[resolution], maxScale(format, photo.width, photo.height))
    const scale = isPreview ? RESOLUTION.web : downloadScale

    const source = await fetchImage(
      targetLongEdge(format, scale) > MEDIUM_LONG_EDGE ? photo.originalPath : photo.mediumPath
    )

    // displayName rather than the bare name column, which is what every other
    // surface on the site prints. A camera stored as name='F4', brand='Nikon'
    // was exported as "F4" while the page title beside it read "Nikon F4".
    const camera = showCamera ? (displayName(photo.camera) || '') : ''
    const film = showFilm ? (displayName(photo.filmStock) || '') : ''
    const username = showUsername ? photo.user.username : ''

    let date = ''
    if (showDate) {
      const when = customDate
        ? new Date(customDate + 'T00:00:00Z')
        : new Date(photo.takenDate ?? photo.createdAt)
      if (!Number.isNaN(when.getTime())) {
        date = when.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' })
      }
    }

    const rotated = sharp(source, SHARP_INPUT).rotate()
    const sourceMeta = await rotated.metadata()
    const srcW = sourceMeta.width || 1000
    const srcH = sourceMeta.height || 1000

    const output = await withRenderSlot(() => renderExport({
      photo: rotated,
      seed: photoId,
      mat: matWidth,
      filmFormat: (Array.isArray(photo.filmStock?.format)
        ? photo.filmStock?.format[0]
        : photo.filmStock?.format) || '35mm',
      filmKind: (showFilm && photo.filmStock
        ? filmTypeLabel(photo.filmStock.chromaticity, photo.filmStock.polarity)
        : null) || '',
      srcW,
      srcH,
      style,
      format,
      scale,
      landscape,
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
    }))

    // What the download would measure, reported so the dialog can print a real
    // number under the size control. Taken from the rendered image rather than
    // recomputed, because each style decides its own canvas — a slide mount is
    // square whatever the format says — and a second copy of that arithmetic in
    // the client is the thing src/lib/exportFormats.ts was just written to stop.
    //
    // A preview is always rendered at web scale, so its dimensions are stepped
    // up by the ratio to the chosen one. Every renderer derives its geometry as
    // a fraction of the canvas, so that ratio is exact to within rounding.
    const rendered = await sharp(output).metadata()
    const step = downloadScale / scale

    return new NextResponse(new Uint8Array(output), {
      headers: {
        'Content-Type': 'image/jpeg',
        'Content-Disposition': isPreview ? 'inline' : `attachment; filename="avoidxray-${photoId}-${format}.jpg"`,
        'Cache-Control': isPreview ? 'private, max-age=60' : 'no-store',
        'X-Export-Width': String(Math.round((rendered.width || 0) * step)),
        'X-Export-Height': String(Math.round((rendered.height || 0) * step)),
      }
    })
  } catch (error) {
    // Saturation is a queue depth, not a failure of this request: the work was
    // never started, so say so and give a time to come back rather than
    // reporting it as a broken export.
    if (error instanceof Saturated) {
      return NextResponse.json(
        { error: 'Too many exports are being generated right now. Please try again in a moment.' },
        { status: 503, headers: { 'Retry-After': '5' } }
      )
    }
    console.error('Export generation error:', error)
    return NextResponse.json({ error: 'Failed to generate the export' }, { status: 500 })
  }
}
