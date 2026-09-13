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
import {
  renderExport,
  sprocketStrip,
  drawnLongEdge,
  canvasMegapixels,
  SPROCKET_SHEET_MARGIN,
} from '@/lib/watermark/render'
import {
  fetchImage,
  withRenderSlot,
  Saturated,
  Abandoned,
  HEAVY_MEGAPIXELS,
} from '@/lib/watermark/serverPipeline'

import {
  CAPTION_MAX_LENGTH,
  MEDIUM_LONG_EDGE,
  ORIGINAL_LONG_EDGE,
  scaleFor,
  isExportFormat,
  isExportStyle,
  isExportTheme,
  isResolution,
  PAPERS,
  printPlan,
  type PaperId,
  maxScale,
  type ExportFormat,
  type ExportStyle,
  type ExportTheme,
  type Resolution,
} from '@/lib/exportFormats'

export type { ExportFormat, ExportStyle }

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
  // Which paper, when this is going to a lab. Any look can be printed: the ones
  // that are objects rather than sheets are laid on it rather than cropped to
  // it, which is what a print of a mounted transparency actually looks like.
  const paperParam = searchParams.get('paper')
  const paper: PaperId = PAPERS.some(p => p.id === paperParam) ? (paperParam as PaperId) : '4x6'
  // Absent means upright, which is what every canvas was before this existed.
  const landscape = searchParams.get('landscape') === '1'
  // Absent means the plain cut, which is the quieter of the two under a
  // photograph. It used to be chosen from the paper, which always gave the
  // heavier one on a white print.
  const invertMark = searchParams.get('invertMark') === '1'
  // Off unless asked. Cropping somebody's photograph without being asked is a
  // worse answer than paper down the sides.
  const fill = searchParams.get('fill') === '1'
  // Present unless refused, so a filmstrip keeps the sheet it has always had
  // and a viewer who wants the strip alone can say so.
  const border = searchParams.get('border') !== '0'

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

    // Paper is measured in inches, so the scale it needs is the one that draws
    // the object at the sheet's own long edge — not a step on a table of screen
    // canvases. Capped by the scan, which is never enlarged to reach a paper it
    // cannot fill: the density is reported honestly instead.
    const sheet = resolution === 'print' ? printPlan(paper, landscape, srcW, srcH) : null
    // The sheet's own long edge, and no more.
    //
    // This carried a 1.35 headroom factor on the reasoning that a look is wider
    // than the photograph inside it, so rendering to the sheet exactly would
    // leave the picture short of the paper. The algebra says otherwise: the
    // picture is drawn at 1600·s, the object comes out 1600·s·k for that look's
    // overhead k, and layOnPaper then fits the object to the sheet — so the
    // final picture is sheetLong / k whatever s was. The factor could not
    // change the output and inflated the intermediate canvas by 1.35², which on
    // the largest frame is most of a 2GB box. Confirmed against real renders:
    // mean difference 0.2 of 255, which is the encoder, not detail.
    const printScale = sheet
      ? Math.min(ceiling, Math.max(sheet.w, sheet.h) / ORIGINAL_LONG_EDGE)
      : 0
    const downloadScale = sheet
      ? printScale
      : Math.min(scaleFor(resolution, format, ceiling), ceiling)
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
    // What this will actually composite, asked of the renderers rather than
    // estimated from the photograph.
    //
    // It used to measure how large the *picture* would be drawn, which is not
    // the question: every look puts something around it, and measured against
    // real renders the canvas runs from 1.4 times the picture's area for a
    // gallery print to 5.4 times for a panoramic filmstrip. Two of those were
    // being admitted as light and composited beside each other.
    //
    // On the print path both the object and the sheet it is laid on are held at
    // once, so the peak is the sum rather than the larger.
    const objectWeight = canvasMegapixels(style, format, downloadScale, landscape, srcW, srcH, border)
    const weight = sheet ? objectWeight + (sheet.w * sheet.h) / 1e6 : objectWeight
    const heavy = !isPreview && weight > HEAVY_MEGAPIXELS

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
        border,
        sheet: isPreview ? null : sheet,
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
        const grown = border ? 1 + SPROCKET_SHEET_MARGIN * 2 : 1
        return { w: Math.round(strip.w * grown), h: Math.round(strip.h * grown) }
      }
      const step = at / scale
      return {
        w: Math.round((rendered.width || 0) * step),
        h: Math.round((rendered.height || 0) * step),
      }
    }

    // Every step, always, and each clamped to what the scan can fill.
    //
    // This listed only the steps availableResolutions offers, which withholds
    // "high" below twice the screen canvas and "full" below that again — so for
    // any scan whose long edge falls between 1600 and 3200 the header came back
    // as "web=" alone. The dialog then printed the scale-1 size under a preview
    // whose file is delivered at the scan's own resolution, and said it aloud
    // to a screen reader: a 3190px frame was announced as 1600px. That band is
    // roughly the smaller half of the library.
    //
    // Clamped because scaleFor returns the step's nominal multiple regardless
    // of the photograph, and the route itself renders min(step, ceiling).
    const sizes = (['web', 'high', 'full'] as Resolution[])
      .map(name => {
        const { w, h } = measure(Math.min(scaleFor(name, format, ceiling), ceiling))
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
