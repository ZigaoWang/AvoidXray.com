import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import sharp from 'sharp'
import { bylineUserSelect } from '@/lib/publicUser'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { canViewPhoto } from '@/lib/photoVisibility'
import { SHARP_INPUT } from '@/lib/sharpConfig'
import { clientIp, enforceLimit } from '@/lib/rateLimit'
import { LIMITS } from '@/lib/rateLimitPolicy'
import { renderExport } from '@/lib/watermark/render'
import {
  fetchImage,
  withRenderSlot,
  Saturated,
  Abandoned,
  catalogFacts,
} from '@/lib/watermark/serverPipeline'
import { LOOKS } from '@/lib/exportFormats'

/**
 * Every look, as one picture.
 *
 * The dialog used to describe its treatments — a word and a 32x26 line drawing
 * apiece — and the only way to find out what "Filmstrip" or "Slide" actually
 * did to *your* photograph was to press each one and wait for a render. Six
 * renders to read a menu. One of the seven had no drawing at all and had been
 * shipping an empty SVG.
 *
 * So the tiles show the thing itself. Not five requests, though: five requests
 * are five trips through a two-slot semaphore, five source fetches to miss the
 * cache in parallel on a cold open, and five rate-limit hits before the viewer
 * has chosen anything. One request holds one slot, fetches once, and returns
 * one strip the client cuts up with background-position.
 */

/** One cell of the strip. Square, so the grid is stable before a byte lands. */
const CELL = 400

/**
 * How large each look is composited before it is fitted into its cell.
 *
 * Not the cell size. Every renderer derives its type, margins and textures as a
 * fraction of its canvas, and two of them stop drawing entirely below a
 * threshold — tiledLayer returns nothing when the canvas is smaller than its
 * tile, so a 400px card would come back with no grain and no pressed board and
 * would lie about the object. Composited at 800 and reduced, the tile is the
 * real thing made small rather than a different thing.
 */
const DRAW_SCALE = 0.35

/** The panel these sit on, so a cell reads as part of it. */
const CELL_GROUND = '#0A0A0A'

/**
 * Finished strips, briefly.
 *
 * This is five composites behind one request, and the dialog asks for it the
 * moment it opens — so without this, closing a dialog and reopening it, or
 * stepping through a roll and coming back, pays for all five again. Measured on
 * the box: about 1.4s to build, nothing to serve from here.
 *
 * Keyed by photograph alone because the strip does not depend on anything the
 * viewer has chosen; it is always each look's own default state. Small and
 * count-bounded, since every entry is a ~170KB JPEG rather than a source.
 */
const SHEET_CACHE_ENTRIES = 24
const SHEET_CACHE_TTL_MS = 10 * 60 * 1000
const sheetCache = new Map<string, { buffer: Buffer; at: number }>()

function sheetResponse(strip: Buffer, photo: { published: boolean; visibility: string }) {
  return new NextResponse(new Uint8Array(strip), {
    headers: {
      'Content-Type': 'image/jpeg',
      // What the client needs to slice it, rather than a second copy of the
      // look order living in the browser.
      'X-Sheet-Looks': LOOKS.map(l => l.id).join(','),
      'X-Sheet-Cell': String(CELL),
      // Cached only where caching is safe. A published photograph's sheet is
      // the same for everybody; anything canViewPhoto gates is not, and must
      // not be handed to the next reader by a shared cache.
      'Cache-Control': photo.published && photo.visibility === 'PUBLIC'
        ? 'public, max-age=300, s-maxage=86400'
        : 'private, no-store',
    },
  })
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const photoId = searchParams.get('id')

  if (!photoId) {
    return NextResponse.json({ error: 'Photo ID required' }, { status: 400 })
  }

  const limited = enforceLimit(
    'watermark', clientIp(req.headers), LIMITS.watermark.perIp,
    'Too many exports from this connection.'
  )
  if (limited) return limited

  const photo = await prisma.photo.findUnique({
    where: { id: photoId },
    include: { camera: true, filmStock: true, user: { select: bylineUserSelect } },
  })

  const session = await getServerSession(authOptions)
  const viewerId = (session?.user as { id?: string } | undefined)?.id ?? null

  if (!photo || !canViewPhoto(photo, viewerId)) {
    return NextResponse.json({ error: 'Photo not found' }, { status: 404 })
  }

  // Answered after the visibility check above, never before it: a cache that
  // serves a private photograph to whoever asks second is worse than no cache.
  const held = sheetCache.get(photoId)
  if (held && Date.now() - held.at <= SHEET_CACHE_TTL_MS) {
    sheetCache.delete(photoId)
    sheetCache.set(photoId, held)
    return sheetResponse(held.buffer, photo)
  }

  try {
    if (req.signal.aborted) return new NextResponse(null, { status: 499 })

    const facts = catalogFacts(photo)

    // The medium, always. A contact sheet is five pictures 400px wide; pulling
    // an original across the Pacific to build one would cost more than every
    // render in it put together.
    const cells = await withRenderSlot(false, async () => {
      if (req.signal.aborted) throw new Abandoned()
      const source = await fetchImage(photo.mediumPath)

      const drawn: Buffer[] = []
      for (const look of LOOKS) {
        // Sequential rather than parallel: this already holds one of two slots,
        // and five concurrent composites inside it would be exactly the
        // overcommit the semaphore exists to prevent.
        if (req.signal.aborted) throw new Abandoned()
        const tile = await renderExport({
          ...facts,
          photo: sharp(source, SHARP_INPUT).rotate(),
          seed: photoId,
          mat: 55,
          srcW: photo.width,
          srcH: photo.height,
          style: look.style,
          format: 'original',
          scale: DRAW_SCALE,
          landscape: photo.width > photo.height,
          invertMark: false,
          print: false,
          fill: false,
          theme: look.theme,
          // The photograph's own caption, so a tile shows what the file will
          // say rather than a blank version of it.
          caption: photo.caption?.slice(0, 50) ?? '',
          qrUrl: null,
          quality: 78,
        })

        drawn.push(
          await sharp({
            create: { width: CELL, height: CELL, channels: 3, background: CELL_GROUND },
          })
            .composite([{
              input: await sharp(tile)
                .resize(CELL - 24, CELL - 24, { fit: 'inside' })
                .toBuffer(),
              gravity: 'centre',
            }])
            .png()
            .toBuffer()
        )
      }
      return drawn
    })

    const strip = await sharp({
      create: { width: CELL * cells.length, height: CELL, channels: 3, background: CELL_GROUND },
    })
      .composite(cells.map((input, i) => ({ input, left: i * CELL, top: 0 })))
      .jpeg({ quality: 82 })
      .toBuffer()

    sheetCache.set(photoId, { buffer: strip, at: Date.now() })
    for (const oldest of sheetCache.keys()) {
      if (sheetCache.size <= SHEET_CACHE_ENTRIES) break
      sheetCache.delete(oldest)
    }

    return sheetResponse(strip, photo)
  } catch (error) {
    if (error instanceof Abandoned) return new NextResponse(null, { status: 499 })
    if (error instanceof Saturated) {
      return NextResponse.json(
        { error: 'Too many exports are being generated right now.' },
        { status: 503, headers: { 'Retry-After': '5' } }
      )
    }
    console.error('Contact sheet error:', error)
    return NextResponse.json({ error: 'Failed to generate the contact sheet' }, { status: 500 })
  }
}
