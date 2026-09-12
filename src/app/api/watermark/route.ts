import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
// sharp 0.35 dropped the `sharp.X` type namespace in favor of named type
// exports; the runtime default export is unchanged.
import sharp, { type OverlayOptions, type Sharp } from 'sharp'
import fs from 'fs'
import path from 'path'
import QRCode from 'qrcode'
import { createCanvas, registerFont } from 'canvas'
import { bylineUserSelect } from '@/lib/publicUser'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { canViewPhoto } from '@/lib/photoVisibility'
import { SHARP_INPUT } from '@/lib/sharpConfig'
import { clientIp, enforceLimit } from '@/lib/rateLimit'
import { LIMITS } from '@/lib/rateLimitPolicy'
import { asInt } from '@/lib/requestBody'
import { displayName } from '@/lib/seo/alt'

import {
  CAPTION_MAX_LENGTH,
  MEDIUM_LONG_EDGE,
  ORIGINAL_LONG_EDGE,
  RESOLUTION,
  canvasOf,
  isExportFormat,
  isExportStyle,
  isResolution,
  maxScale,
  targetLongEdge,
  type ExportFormat,
  type ExportStyle,
  type Resolution,
} from '@/lib/exportFormats'

export type { ExportFormat, ExportStyle }

// Load and cache font files as base64 once at startup
const fontsDir = path.join(process.cwd(), 'public', 'fonts')
const FONT_BASE64 = {
  regular: fs.readFileSync(path.join(fontsDir, 'Inter-Regular.ttf')).toString('base64'),
  medium: fs.readFileSync(path.join(fontsDir, 'Inter-Medium.ttf')).toString('base64'),
  semibold: fs.readFileSync(path.join(fontsDir, 'Inter-SemiBold.ttf')).toString('base64'),
  bold: fs.readFileSync(path.join(fontsDir, 'Inter-Bold.ttf')).toString('base64'),
  mono: fs.readFileSync(path.join(fontsDir, 'JetBrainsMono-Bold.ttf')).toString('base64'),
  hand: fs.readFileSync(path.join(fontsDir, 'Kalam-Regular.ttf')).toString('base64')
}

// Also register fonts for canvas (for local development)
try {
  registerFont(path.join(fontsDir, 'Inter-Regular.ttf'), { family: 'Inter', weight: '400' })
  registerFont(path.join(fontsDir, 'Inter-Medium.ttf'), { family: 'Inter', weight: '500' })
  registerFont(path.join(fontsDir, 'Inter-SemiBold.ttf'), { family: 'Inter', weight: '600' })
  registerFont(path.join(fontsDir, 'Inter-Bold.ttf'), { family: 'Inter', weight: '700' })
  registerFont(path.join(fontsDir, 'JetBrainsMono-Bold.ttf'), { family: 'JetBrains Mono', weight: '700' })
  registerFont(path.join(fontsDir, 'Kalam-Regular.ttf'), { family: 'Kalam', weight: '400' })
  console.log('✅ Canvas fonts registered successfully')
} catch (error) {
  console.error('❌ Failed to register canvas fonts:', error)
}

// The wide wordmark, 307x56. The stacked 150x117 mark was unreadable at any
// height that did not dominate the caption.
// Named for the background it goes on, not for its own color: logo.svg is a
// white box with black lettering, so it needs something dark behind it.
const WORDMARK = {
  onLight: fs.readFileSync(path.join(process.cwd(), 'public', 'logo-inverted.svg'), 'utf-8'),
  onDark: fs.readFileSync(path.join(process.cwd(), 'public', 'logo.svg'), 'utf-8'),
}

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

// Create text image using canvas with custom fonts, with SVG fallback
async function createTextImage(
  text: string,
  fontSize: number,
  color: string,
  options: { weight?: number; letterSpacing?: number; align?: 'left' | 'center' | 'right'; width?: number; fontStyle?: 'sans' | 'mono' | 'hand' } = {}
): Promise<Buffer> {
  const { weight = 400, letterSpacing = 0, align = 'left', width, fontStyle = 'sans' } = options

  try {
    // Try canvas approach first (better quality, works if canvas is properly installed)
    return createTextImageCanvas(text, fontSize, color, options)
  } catch (error) {
    console.warn('Canvas text rendering failed, falling back to SVG:', error)
    // Fallback to SVG with embedded fonts
    return await createTextImageSVG(text, fontSize, color, options)
  }
}

// Canvas-based text rendering (preferred)
function createTextImageCanvas(
  text: string,
  fontSize: number,
  color: string,
  options: { weight?: number; letterSpacing?: number; align?: 'left' | 'center' | 'right'; width?: number; fontStyle?: 'sans' | 'mono' | 'hand' } = {}
): Buffer {
  const { weight = 400, letterSpacing = 0, align = 'left', width, fontStyle = 'sans' } = options

  // Select font family based on style
  let fontFamily = 'Inter'
  let fontWeight = weight.toString()

  if (fontStyle === 'mono') {
    fontFamily = 'JetBrains Mono'
    fontWeight = '700'
  } else if (fontStyle === 'hand') {
    fontFamily = 'Kalam'
    fontWeight = '400'
  }

  // Create canvas to measure text
  const measureCanvas = createCanvas(1, 1)
  const measureCtx = measureCanvas.getContext('2d')
  measureCtx.font = `${fontWeight} ${fontSize}px "${fontFamily}"`

  // Measure text with letter spacing
  let textWidth = 0
  for (let i = 0; i < text.length; i++) {
    textWidth += measureCtx.measureText(text[i]).width
    if (i < text.length - 1) {
      textWidth += letterSpacing
    }
  }

  const estimatedWidth = width || Math.ceil(textWidth + fontSize * 0.2)
  const height = Math.ceil(fontSize * 1.4)

  // Create actual canvas
  const canvas = createCanvas(estimatedWidth, height)
  const ctx = canvas.getContext('2d')

  // Set font and color
  ctx.font = `${fontWeight} ${fontSize}px "${fontFamily}"`
  ctx.fillStyle = color
  ctx.textBaseline = 'top'

  // Calculate x position based on alignment
  let x = 0
  if (align === 'center') {
    x = (estimatedWidth - textWidth) / 2
  } else if (align === 'right') {
    x = estimatedWidth - textWidth
  }

  // Draw text with letter spacing
  let currentX = x
  for (let i = 0; i < text.length; i++) {
    ctx.fillText(text[i], currentX, fontSize * 0.05)
    currentX += ctx.measureText(text[i]).width + letterSpacing
  }

  return canvas.toBuffer('image/png')
}

// SVG-based text rendering with embedded fonts (fallback)
async function createTextImageSVG(
  text: string,
  fontSize: number,
  color: string,
  options: { weight?: number; letterSpacing?: number; align?: 'left' | 'center' | 'right'; width?: number; fontStyle?: 'sans' | 'mono' | 'hand' } = {}
): Promise<Buffer> {
  const { weight = 400, letterSpacing = 0, align = 'left', width, fontStyle = 'sans' } = options

  // Select font base64 based on weight and style
  let fontBase64: string
  let fontFamily = 'Inter'

  if (fontStyle === 'hand') {
    fontBase64 = FONT_BASE64.hand
    fontFamily = 'Kalam'
  } else if (fontStyle === 'mono') {
    fontBase64 = FONT_BASE64.mono
    fontFamily = 'JetBrains Mono'
  } else {
    if (weight >= 700) {
      fontBase64 = FONT_BASE64.bold
    } else if (weight >= 600) {
      fontBase64 = FONT_BASE64.semibold
    } else if (weight >= 500) {
      fontBase64 = FONT_BASE64.medium
    } else {
      fontBase64 = FONT_BASE64.regular
    }
  }

  const estimatedWidth = width || Math.ceil(text.length * fontSize * 0.7)
  const height = Math.ceil(fontSize * 1.4)

  let x = 0
  let anchor = 'start'
  if (align === 'center') {
    x = estimatedWidth / 2
    anchor = 'middle'
  } else if (align === 'right') {
    x = estimatedWidth
    anchor = 'end'
  }

  // Create SVG with embedded font
  const svg = `<svg width="${estimatedWidth}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <style type="text/css">
        @font-face {
          font-family: '${fontFamily}';
          src: url(data:font/truetype;charset=utf-8;base64,${fontBase64}) format('truetype');
          font-weight: ${weight};
          font-style: normal;
        }
      </style>
    </defs>
    <text x="${x}" y="${fontSize * 1.05}" font-size="${fontSize}" font-weight="${weight}" fill="${color}" text-anchor="${anchor}" letter-spacing="${letterSpacing}" font-family="${fontFamily}">${escapeXml(text)}</text>
  </svg>`

  // Convert SVG to PNG using Sharp
  return await sharp(Buffer.from(svg)).png().toBuffer()
}

function escapeXml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}


const THEMES = {
  light: { paper: '#FFFFFF', ink: '#111111', muted: '#8A8A8A', hairline: '#E4E4E4', mark: 'light' },
  dark: { paper: '#0A0A0A', ink: '#FFFFFF', muted: '#8A8A8A', hairline: '#242424', mark: 'dark' },
} as const

/** 35mm cardboard mount, as the lab returns a mounted transparency. */
const SLIDE = {
  mount: '#C3C0B5',
  print: '#B0342C',
  window: '#0B0B0B',
  ink: '#4A473F',
  /** Ballpoint blue, for a remark written on the board. */
  pen: '#2A3A6B',
} as const

/**
 * A tile of film grain, built once at startup and repeated across the frame.
 * The previous renderer generated 160,000 random pixels on every request.
 */
const GRAIN_SIZE = 256
const GRAIN = (async () => {
  const size = GRAIN_SIZE
  const data = Buffer.alloc(size * size * 4)
  for (let i = 0; i < size * size; i++) {
    const noise = 128 + Math.round((Math.random() - 0.5) * 30)
    data[i * 4] = noise
    data[i * 4 + 1] = noise
    data[i * 4 + 2] = noise
    data[i * 4 + 3] = 44
  }
  return sharp(data, { raw: { width: size, height: size, channels: 4 } }).png().toBuffer()
})()

/**
 * A tiled overlay, or nothing at all when the frame is smaller than the tile.
 *
 * sharp rejects any composite whose input is larger than the base in either
 * axis — "Image to composite must have same dimensions or smaller" — and it
 * decides that before the tiling is applied, so a repeating texture is refused
 * just like a single one. Every renderer added its textures unconditionally, so
 * a small enough canvas threw and the export came back as a 500. A 240x180
 * scan on "as shot" at the default mat makes a 306x251 frame, which is under
 * the 256px grain tile on the short side.
 *
 * Returned as a list so a caller can spread it: nothing is the honest answer
 * here. A frame that small has no room to show a texture anyway.
 */
async function tiledLayer(
  tile: Promise<Buffer>, tileSize: number, canvasW: number, canvasH: number,
  blend: OverlayOptions['blend'] = 'overlay'
): Promise<OverlayOptions[]> {
  if (canvasW < tileSize || canvasH < tileSize) return []
  return [{ input: await tile, tile: true, blend }]
}

/** Grain laid over the whole frame, as an overlay so it darkens and lifts. */
function grainLayer(canvasW: number, canvasH: number): Promise<OverlayOptions[]> {
  return tiledLayer(GRAIN, GRAIN_SIZE, canvasW, canvasH)
}

/**
 * Card stock: coarser than film grain and warm, with slow mottling so a mount
 * reads as pressed board rather than a flat fill.
 */
const CARD_TEXTURE_SIZE = 320
const CARD_TEXTURE = (async () => {
  const size = CARD_TEXTURE_SIZE
  const data = Buffer.alloc(size * size * 4)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4
      const mottle = Math.sin(x * 0.045) * 4 + Math.cos(y * 0.037) * 4
      const fibre = (Math.random() - 0.5) * 40
      const value = 128 + mottle + fibre
      data[i] = Math.max(0, Math.min(255, value + 6))
      data[i + 1] = Math.max(0, Math.min(255, value + 2))
      data[i + 2] = Math.max(0, Math.min(255, value - 6))
      data[i + 3] = 140
    }
  }
  return sharp(data, { raw: { width: size, height: size, channels: 4 } }).png().toBuffer()
})()

function hexToRgb(hex: string) {
  return {
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16),
  }
}

/** One caption line, shortened only if it would overrun the frame. */
async function renderCaptionLine(
  text: string, size: number, color: string, weight: number, letterSpacing: number,
  maxWidth: number, fontStyle?: 'sans' | 'mono' | 'hand'
): Promise<Buffer> {
  let current = text
  for (let attempt = 0; attempt < 5; attempt++) {
    const buffer = await createTextImage(current, size, color, { weight, letterSpacing, fontStyle })
    const width = (await sharp(buffer).metadata()).width || 0
    if (width <= maxWidth || current.length <= 4) return buffer
    const keep = Math.max(3, Math.floor(current.length * (maxWidth / width)) - 1)
    current = `${text.slice(0, keep).trimEnd()}…`
  }
  return createTextImage(current, size, color, { weight, letterSpacing, fontStyle })
}

const widthOf = async (buffer: Buffer) => (await sharp(buffer).metadata()).width || 0

/**
 * A length of film with perforations punched along its two long edges.
 *
 * Which edges those are depends on the frame: a portrait photograph means the
 * strip is running vertically, so the perforations are down the sides. Putting
 * them along the top and bottom regardless is the thing that made it read as a
 * black box with holes in it rather than as film.
 */
function filmBand(width: number, height: number, perforation: number, vertical: boolean): Buffer {
  const short = Math.round(perforation * 0.5)
  const long = Math.round(short * 1.25)
  const radius = Math.round(short * 0.28)
  const inset = Math.round((perforation - short) / 2)

  const span = vertical ? height : width
  const pitch = Math.round(long * 2)
  const count = Math.max(2, Math.floor(span / pitch))
  const used = count * long + (count - 1) * (pitch - long)
  const start = Math.round((span - used) / 2)

  const holes = (offset: number) =>
    Array.from({ length: count }, (_, i) => {
      const along = start + i * pitch
      const x = vertical ? offset : along
      const y = vertical ? along : offset
      const w = vertical ? short : long
      const h = vertical ? long : short
      return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${radius}" fill="#FFFFFF"/>`
    }).join('')

  const near = inset
  const far = (vertical ? width : height) - perforation + inset

  return Buffer.from(
    `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">` +
    `<rect width="${width}" height="${height}" fill="#0B0B0B"/>` +
    holes(near) + holes(far) +
    `</svg>`
  )
}

interface RenderContext {
  photo: Sharp
  /** Mat width for the bare style, 0-100. */
  mat: number
  /** Film format, printed on the slide mount. */
  filmFormat: string
  /** Photo id, so per-frame variation is stable between preview and download. */
  seed: string
  srcW: number
  srcH: number
  format: ExportFormat
  /** Whole multiple of the canvas this is rendered at. See RESOLUTION. */
  scale: number
  /** Whether the canvas lies on its side. Square and "as shot" ignore it. */
  landscape: boolean
  theme: keyof typeof THEMES
  caption: string
  camera: string
  film: string
  username: string
  date: string
  qrUrl: string | null
}

/** Canvas width, and the fixed height when the format dictates one. */
function canvasBase(format: ExportFormat, srcW: number, srcH: number, matRatio: number, scale: number, landscape: boolean) {
  if (format !== 'original') {
    const { w, h } = canvasOf(format, scale, landscape)
    return { width: w, fixedHeight: h as number | null }
  }
  const fit = Math.min(1, (ORIGINAL_LONG_EDGE * scale) / Math.max(srcW, srcH))
  const w = Math.round(srcW * fit)
  const h = Math.round(srcH * fit)
  return { width: w + Math.round(Math.max(w, h) * matRatio) * 2, fixedHeight: null }
}

/**
 * The final JPEG, encoded with libjpeg rather than mozjpeg.
 *
 * mozjpeg's trellis quantization searches every block for the cheapest
 * coefficients that still look right, and film grain is the worst case for that
 * search: every block is high-entropy, so nothing quantizes cheaply and the
 * encoder pays full price on all of them. The same comparison on a flat
 * synthetic raster is only about half as bad, which is why this never looked
 * like the problem.
 *
 * Measured on 35mm grain, at the sizes this route actually emits, mozjpeg
 * against libjpeg at the same quality:
 *
 *   1080x1080  square      726ms   vs   72ms
 *   1080x1350  post        934ms   vs   44ms
 *   1080x1920  story      1559ms   vs   68ms
 *   3000x2400  8x10       4710ms   vs  251ms
 *
 * It saves a flat 16% of the bytes at every one of them, so there is no size
 * where the trade is worth taking and no threshold worth writing. This was the
 * dominant cost of every export on the site — previews included, and a preview
 * is revoked at the next click. A 36-frame batch is 145 seconds of encode with
 * it and 6 seconds without.
 *
 * The bytes are not missed: the three social canvases go to platforms that
 * recompress on upload, which discards mozjpeg's saving anyway.
 */
async function encode(canvasW: number, canvasH: number, paper: string, composites: OverlayOptions[], quality: number) {
  return sharp({ create: { width: canvasW, height: canvasH, channels: 3, background: hexToRgb(paper) } })
    .composite(composites)
    .jpeg({ quality })
    .toBuffer()
}

/** Nothing but the photograph and an even mat. */
async function renderBare(ctx: RenderContext, quality: number): Promise<Buffer> {
  const palette = THEMES[ctx.theme]
  // The control sets the size of the photograph, so the mat is what gives way:
  // all the way up is edge to edge, all the way down is a wide gallery mat.
  const ratio = 0.30 - (ctx.mat / 100) * 0.295
  const { width: canvasW, fixedHeight } = canvasBase(ctx.format, ctx.srcW, ctx.srcH, ratio, ctx.scale, ctx.landscape)
  const margin = Math.round(canvasW * ratio)

  const frameW = canvasW - margin * 2
  const frameH = fixedHeight !== null ? fixedHeight - margin * 2 : Math.round((ctx.srcH / ctx.srcW) * frameW)

  const fitted = await ctx.photo.resize(frameW, frameH, { fit: 'inside' }).toBuffer()
  const m = await sharp(fitted).metadata()
  const photoW = m.width || frameW
  const photoH = m.height || frameH
  const canvasH = fixedHeight ?? photoH + margin * 2

  return encode(canvasW, canvasH, palette.paper, [{
    input: fitted,
    left: Math.round((canvasW - photoW) / 2),
    top: Math.round((canvasH - photoH) / 2),
  }, ...(await grainLayer(canvasW, canvasH))], quality)
}

/** Gallery print: photograph, centered caption, wordmark. */
async function renderClean(ctx: RenderContext, quality: number): Promise<Buffer> {
  const palette = THEMES[ctx.theme]
  const { width: canvasW, fixedHeight } = canvasBase(ctx.format, ctx.srcW, ctx.srcH, 0.043, ctx.scale, ctx.landscape)
  const margin = Math.round(canvasW * 0.043)
  const gap = Math.round(canvasW * 0.036)
  const titleSize = Math.round(canvasW * 0.028)
  const metaSize = Math.round(canvasW * 0.019)
  const lineGap = Math.round(canvasW * 0.012)

  // Set as written. Letterspaced capitals read as a label on a form, and the
  // camera and film names are proper nouns that lose their shape in caps.
  const gear = [ctx.camera, ctx.film].filter(Boolean).join('  ·  ')
  const byline = [ctx.username ? `@${ctx.username}` : '', ctx.date].filter(Boolean).join('  ·  ')

  const lines: { text: string; size: number; color: string; weight: number; track: number }[] = []
  if (ctx.caption) lines.push({ text: ctx.caption, size: titleSize, color: palette.ink, weight: 700, track: 0 })
  if (gear) lines.push({ text: gear, size: metaSize, color: palette.ink, weight: 500, track: 0 })
  if (byline) lines.push({ text: byline, size: Math.round(metaSize * 0.92), color: palette.muted, weight: 400, track: 0 })

  const lineHeights = lines.map(l => Math.ceil(l.size * 1.4))
  const textHeight = lineHeights.reduce((a, b) => a + b, 0) + lineGap * Math.max(0, lines.length - 1)

  const logoHeight = Math.round(canvasW * 0.032)
  const logoGap = lines.length ? Math.round(canvasW * 0.026) : 0
  const logo = await sharp(Buffer.from(palette.mark === 'dark' ? WORDMARK.onDark : WORDMARK.onLight))
    .resize({ height: logoHeight }).png().toBuffer()
  const logoW = await widthOf(logo)

  const qrSize = ctx.qrUrl ? Math.round(canvasW * 0.062) : 0
  const qrGap = ctx.qrUrl ? Math.round(canvasW * 0.022) : 0
  const markRowH = Math.max(logoHeight, qrSize)
  const markRowW = logoW + (ctx.qrUrl ? qrGap + qrSize : 0)

  const blockHeight = textHeight + logoGap + markRowH
  const frameW = canvasW - margin * 2
  const frameH = fixedHeight !== null
    ? fixedHeight - margin * 2 - gap - blockHeight
    : Math.round((ctx.srcH / ctx.srcW) * frameW)

  const fitted = await ctx.photo.resize(frameW, frameH, { fit: 'inside' }).toBuffer()
  const fm = await sharp(fitted).metadata()
  const photoW = fm.width || frameW
  const photoH = fm.height || frameH
  const canvasH = fixedHeight ?? margin * 2 + photoH + gap + blockHeight
  const photoLeft = Math.round((canvasW - photoW) / 2)
  const photoTop = margin + Math.round((frameH - photoH) / 2)

  const rendered = await Promise.all(
    lines.map(l => renderCaptionLine(l.text, l.size, l.color, l.weight, l.track, frameW))
  )

  const center = (w: number) => Math.round((canvasW - w) / 2)
  const composites: OverlayOptions[] = [{
    input: Buffer.from(
      `<svg width="${photoW + 2}" height="${photoH + 2}"><rect x="0.5" y="0.5" width="${photoW + 1}" height="${photoH + 1}" fill="none" stroke="${palette.hairline}" stroke-width="1"/></svg>`
    ),
    left: photoLeft - 1,
    top: photoTop - 1,
  }, { input: fitted, left: photoLeft, top: photoTop }]

  let cursorY = photoTop + photoH + gap
  for (const [i, buffer] of rendered.entries()) {
    composites.push({ input: buffer, left: center(await widthOf(buffer)), top: cursorY })
    cursorY += lineHeights[i] + lineGap
  }

  cursorY += logoGap - (lines.length ? lineGap : 0)
  const markLeft = center(markRowW)
  composites.push({ input: logo, left: markLeft, top: cursorY + Math.round((markRowH - logoHeight) / 2) })

  if (ctx.qrUrl) {
    const qr = await QRCode.toBuffer(ctx.qrUrl, { width: qrSize, margin: 2, color: { dark: '#000000', light: '#FFFFFF' } })
    composites.push({ input: qr, left: markLeft + logoW + qrGap, top: cursorY + Math.round((markRowH - qrSize) / 2) })
  }
  composites.push(...(await grainLayer(canvasW, canvasH)))

  return encode(canvasW, canvasH, palette.paper, composites, quality)
}

/** Film base and edge printing, as a lab scanner sees the whole width. */
const FILM = {
  // A perforation is a hole, so the scanner's light comes straight through it.
  base: '#1A1310',
  hole: '#F2F0EA',
  holeEdge: '#D5D1C6',
  edge: '#E9A23B',
  adjacent: '#0A0A08',
} as const

/** Low-frequency mottling, so the rebate's density varies across the strip. */
const REBATE_NOISE_SIZE = 96
const REBATE_NOISE = (async () => {
  const size = REBATE_NOISE_SIZE
  const data = Buffer.alloc(size * size * 4)
  for (let i = 0; i < size * size; i++) {
    const noise = 128 + Math.round((Math.random() - 0.5) * 120)
    data[i * 4] = noise
    data[i * 4 + 1] = noise
    data[i * 4 + 2] = noise
    data[i * 4 + 3] = 26
  }
  return sharp(data, { raw: { width: size, height: size, channels: 4 } }).blur(6).png().toBuffer()
})()
const NEGATIVE_MASK = '#FFA75C'

/**
 * 35mm geometry, as a fraction of the film's short dimension.
 *
 *   0.0-4.6%   outer margin      edge printing lives here, and only here
 *   4.6-10.2%  perforation row
 *  10.2-15.7%  gap               always empty on real film
 *  15.7-84.3%  image area
 *
 * then mirrored. The margin is narrower than the perforation row, so the type
 * that sits in it has to be small.
 */
const F = {
  margin: 0.046,
  perfTop: 0.046,
  perfDepth: 0.056,
  imageTop: 0.157,
  imageHeight: 0.686,
  pitch: 0.134,
  holeLength: 0.079,
  interframe: 0.053,
  jitter: 0.005,
} as const

/** Deterministic 0-1 from the photo id, so a frame looks the same every render. */
function seeded(seed: string, salt: number): number {
  let hash = 2166136261 ^ salt
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return ((hash >>> 0) % 10000) / 10000
}

/**
 * A DX latent-image code: two rows of thin bars, one or two units wide with a
 * single unit between them. Dense and regular, the way machine-read code is.
 */
function dxBars(seed: string, unit: number, length: number, barH: number, rowGap: number): Buffer {
  const bars: string[] = []
  let x = 0
  let i = 0
  // Every bar the same height; only the width varies, and the gap never does.
  while (x < length) {
    const w = unit * (seeded(seed, 900 + i) > 0.5 ? 2 : 1)
    if (x + w > length) break
    bars.push(`<rect x="${x}" y="0" width="${w}" height="${barH}" fill="${FILM.edge}"/>`)
    bars.push(`<rect x="${x}" y="${barH + rowGap}" width="${w}" height="${barH}" fill="${FILM.edge}"/>`)
    x += w + unit
    i++
  }
  const height = barH * 2 + rowGap
  return Buffer.from(
    `<svg width="${Math.max(1, Math.round(x))}" height="${height}" xmlns="http://www.w3.org/2000/svg">${bars.join('')}</svg>`
  )
}

/**
 * The full width of the film, to 35mm proportions.
 *
 * Rendered with the strip running horizontally and turned at the end when the
 * photograph is upright, which is how a portrait shot actually sits on a roll.
 */
async function renderSprocket(ctx: RenderContext, quality: number, invert: boolean): Promise<Buffer> {
  const palette = THEMES[ctx.theme]
  const portrait = ctx.srcH > ctx.srcW
  const aspect = Math.max(ctx.srcW, ctx.srcH) / Math.min(ctx.srcW, ctx.srcH)

  // Perforations belong on the film's long edges, so the strip runs along the
  // long side of the frame: down the sides of an upright shot, across the top
  // and bottom of a wide one. It is built lying down and turned at the end.
  //
  // Scaled with the export: the strip is built at its own size and then fitted
  // to the canvas, so a fixed width here would be enlarged rather than drawn
  // larger once the canvas grew past it. Every measurement below is a fraction
  // of W, so the whole strip scales with it.
  //
  // Capped by the photograph, because this is the most expensive thing the
  // route builds and the one place a larger export can cost far more than the
  // canvas it ends up in. The image area is F.imageHeight of the strip's width,
  // so a strip wider than the source divided by that fraction is enlarging the
  // scan to fill a frame it cannot fill — paying for a 20-megapixel
  // intermediate to produce something no sharper. The floor of 1500 keeps the
  // smallest export exactly as it was.
  const W = Math.max(1500, Math.min(
    1500 * ctx.scale,
    Math.round(Math.min(ctx.srcW, ctx.srcH) / F.imageHeight)
  ))
  const px = (fraction: number) => Math.round(fraction * W)
  const imageH = px(F.imageHeight)
  const frameLen = Math.round(imageH * aspect)
  const stripLen = frameLen
  const imageY = px(F.imageTop)

  const rebate = Buffer.from(
    `<svg width="${stripLen}" height="${W}" xmlns="http://www.w3.org/2000/svg">` +
    `<rect width="${stripLen}" height="${W}" fill="${FILM.base}"/></svg>`
  )

  const pitch = px(F.pitch)
  const holeLen = px(F.holeLength)
  const holeDepth = px(F.perfDepth)
  const radius = Math.max(1, Math.round(holeDepth * 0.26))
  const rowYs = [px(F.perfTop), W - px(F.perfTop) - holeDepth]
  const jitter = px(F.jitter)
  const holeFill = palette.paper
  const holes: string[] = []

  for (let i = 0; i * pitch < stripLen + pitch; i++) {
    const offset = Math.round((seeded(ctx.seed, i * 31) - 0.5) * 2 * jitter)
    const grow = Math.round((seeded(ctx.seed, i * 57) - 0.5) * 2 * jitter)
    const x = i * pitch + offset
    for (const y of rowYs) {
      holes.push(
        `<rect x="${x}" y="${y}" width="${holeLen + grow}" height="${holeDepth}" rx="${radius}" ` +
        `fill="${holeFill}" stroke="rgba(0,0,0,0.28)" stroke-width="1"/>`
      )
    }
  }
  const perforations = Buffer.from(
    `<svg width="${stripLen}" height="${W}" xmlns="http://www.w3.org/2000/svg">${holes.join('')}</svg>`
  )

  let source = ctx.photo
  if (portrait) source = source.rotate(90)
  let pipeline = source.resize(frameLen, imageH, { fit: 'fill' })
  if (invert) pipeline = pipeline.negate({ alpha: false }).linear(0.82, 22).modulate({ saturation: 0.7 })
  const exposure = await pipeline.toBuffer()
  const frame = invert
    ? await sharp(exposure)
        .composite([{
          input: { create: { width: frameLen, height: imageH, channels: 3, background: hexToRgb(NEGATIVE_MASK) } },
          blend: 'multiply',
        }])
        .toBuffer()
    : exposure

  const type = Math.max(7, px(0.030))
  const marginH = px(F.margin)
  const topY = Math.round((marginH - Math.ceil(type * 1.4)) / 2)
  const bottomY = W - marginH + Math.round((marginH - Math.ceil(type * 1.4)) / 2)
  const number = 1 + Math.floor(seeded(ctx.seed, 7) * 36)
  const inset = Math.round(W * 0.035)
  const runLimit = Math.max(60, stripLen - inset * 2)

  const label = (text: string) =>
    renderCaptionLine(text, type, FILM.edge, 700, Math.max(1, Math.round(type * 0.14)), runLimit, 'mono')

  const filmName = await label(`AVOIDXRAY.COM  ${(ctx.film || 'FILM').toUpperCase()}`)
  const bottomNumber = await label(`${number}  ${number}A  ▶`)
  const handle = await label((ctx.username ? '@' + ctx.username : 'AVOIDXRAY.COM').toUpperCase())

  const unit = Math.max(1, Math.round(W * 0.0025))
  const barH = Math.max(1, Math.round(holeDepth / 8))
  const rowGap = Math.max(1, Math.round(barH * 0.9))
  const bottomNumberW = await widthOf(bottomNumber)
  const handleW = await widthOf(handle)
  const pad = Math.round(W * 0.025)
  const dxRun = Math.max(unit * 8, stripLen - inset * 2 - bottomNumberW - handleW - pad * 2)
  const dx = dxBars(ctx.seed, unit, dxRun, barH, rowGap)
  const dxW = await widthOf(dx)
  const dxY = W - marginH + Math.round((marginH - (barH * 2 + rowGap)) / 2)

  const spread = Math.max(4, Math.round(W * 0.03))
  const glowH = imageH + spread * 2

  /**
   * The halation, blurred on a reduced copy and scaled back up.
   *
   * A Gaussian blur is scale-invariant: shrinking by N, blurring by sigma/N and
   * scaling back gives the same image. Its cost, though, goes with the area, so
   * the full-size blur was much the most expensive operation in this style —
   * measured at 7894ms against 1482ms on a quarter copy, for a mean difference
   * of 0.20/255. A glow has no detail in it to lose.
   */
  const SHRINK = 4
  // The reduced copy has to be materialized. sharp folds consecutive resizes
  // in one pipeline into a single operation, so writing the shrink and the
  // enlargement as one chain silently dropped the shrink and blurred the
  // full-size frame at a quarter of the sigma — a tight rim where the bloom
  // should be. Measured against the full-size blur: 2.87/255 mean error
  // chained, 0.25/255 with the buffer between them.
  const reduced = await sharp(frame)
    .resize(Math.max(1, Math.round(frameLen / SHRINK)), Math.max(1, Math.round(glowH / SHRINK)), { fit: 'fill' })
    .blur((spread * 0.9) / SHRINK)
    .linear(0.22, 0)
    .toBuffer()
  const halation = await sharp(reduced).resize(frameLen, glowH, { fit: 'fill' }).toBuffer()

  const strip = await sharp({
    create: { width: stripLen, height: W, channels: 3, background: hexToRgb(FILM.base) },
  })
    .composite([
      { input: rebate, left: 0, top: 0 },
      ...(await tiledLayer(REBATE_NOISE, REBATE_NOISE_SIZE, stripLen, W)),
      { input: halation, left: 0, top: Math.max(0, imageY - spread), blend: 'screen' },
      { input: perforations, left: 0, top: 0 },
      { input: frame, left: 0, top: imageY },
      { input: filmName, left: inset, top: topY },
      { input: bottomNumber, left: inset, top: bottomY },
      { input: dx, left: inset + bottomNumberW + pad, top: dxY },
      { input: handle, left: Math.max(0, stripLen - inset - handleW), top: bottomY },
      ...(await grainLayer(stripLen, W)),
    ])
    .png()
    .toBuffer()

  const upright = portrait ? await sharp(strip).rotate(-90).toBuffer() : strip
  const um = await sharp(upright).metadata()

  const margin = 0.045
  const sheet = ctx.format === 'original' ? null : canvasOf(ctx.format, ctx.scale, ctx.landscape)
  const canvasW = sheet ? sheet.w : Math.round((um.width || 1) * (1 + margin * 2))
  const canvasH = sheet ? sheet.h : Math.round((um.height || 1) * (1 + margin * 2))

  const fitted = await sharp(upright)
    .resize(Math.round(canvasW * (1 - margin * 2)), Math.round(canvasH * (1 - margin * 2)), { fit: 'inside' })
    .toBuffer()
  const fm = await sharp(fitted).metadata()

  return encode(canvasW, canvasH, palette.paper, [{
    input: fitted,
    left: Math.round((canvasW - (fm.width || 0)) / 2),
    top: Math.round((canvasH - (fm.height || 0)) / 2),
  }], quality)
}

async function renderSlide(ctx: RenderContext, quality: number): Promise<Buffer> {
  const palette = THEMES[ctx.theme]
  const portrait = ctx.srcH > ctx.srcW

  const canvas = ctx.format === 'original'
    ? Math.round(Math.min(ORIGINAL_LONG_EDGE * ctx.scale, Math.max(ctx.srcW, ctx.srcH)))
    : Math.min(...Object.values(canvasOf(ctx.format, ctx.scale, ctx.landscape)))
  const outer = Math.round(canvas * 0.045)
  const mount = canvas - outer * 2
  const radius = Math.round(mount * 0.06)

  const printSize = Math.max(8, Math.round(mount * 0.032))
  const printGap = Math.round(mount * 0.012)
  const bezel = Math.round(mount * 0.02)
  const track = (size: number) => Math.max(1, Math.round(size * 0.14))
  const subSize = Math.max(7, Math.round(mount * 0.021))
  const stampSize = Math.max(7, Math.round(mount * 0.023))

  const stock = (ctx.film || 'Film').toUpperCase()
  const kind = `${(ctx.filmFormat || '35mm').toUpperCase()}  COLOR SLIDE`
  const lab = 'PROCESSED BY AVOIDXRAY.COM'

  const stamp = (() => {
    if (!ctx.date) return ''
    const parts = ctx.date.replace(',', '').split(' ')
    return parts.length >= 3 ? `${parts[0].toUpperCase()} ${parts[2]}` : ctx.date.toUpperCase()
  })()

  const top1 = await renderCaptionLine(stock, printSize, SLIDE.print, 700, track(printSize), mount)
  const top2 = await renderCaptionLine(kind, subSize, SLIDE.print, 500, track(subSize) * 2, mount)
  const labLine = await renderCaptionLine(lab, subSize, SLIDE.print, 600, track(subSize) * 2, mount)
  // Set in the mount's own face rather than a terminal mono, which read as a
  // console readout instead of something printed on card.
  const stampLine = stamp
    ? await createTextImage(stamp, stampSize, SLIDE.ink, { weight: 600, letterSpacing: track(stampSize) * 2 })
    : null

  const printH = Math.ceil(printSize * 1.4) + Math.ceil(subSize * 1.4) + printGap

  const remark = ctx.caption || ctx.camera
  const handSize = Math.max(10, Math.round(mount * 0.05))
  const metaImage = remark
    ? await renderCaptionLine(remark, handSize, SLIDE.pen, 400, 0, Math.round(mount * 0.72), 'hand')
    : null

  // The board is built with the frame lying down and turned at the end, the
  // way the strip is, so a portrait shot gets the same treatment.
  const aperture = Math.round(mount * 0.78)
  let source = ctx.photo
  if (portrait) source = source.rotate(90)
  const fitted = await source.resize(aperture, aperture, { fit: 'inside' }).toBuffer()
  const fm = await sharp(fitted).metadata()
  const photoW = fm.width || aperture
  const photoH = fm.height || aperture
  const frameW = photoW + bezel * 2
  const frameH = photoH + bezel * 2

  const center = (w: number) => Math.round((mount - w) / 2)
  const pad = Math.round(mount * 0.06)

  const shape = Buffer.from(
    `<svg width="${mount}" height="${mount}" xmlns="http://www.w3.org/2000/svg">` +
    `<rect width="${mount}" height="${mount}" rx="${radius}" fill="#FFFFFF"/></svg>`
  )
  const card = await sharp(Buffer.from(
    `<svg width="${mount}" height="${mount}" xmlns="http://www.w3.org/2000/svg">` +
    `<rect width="${mount}" height="${mount}" rx="${radius}" fill="${SLIDE.mount}"/></svg>`
  ))
    .composite([
      ...(await tiledLayer(CARD_TEXTURE, CARD_TEXTURE_SIZE, mount, mount)),
      { input: shape, blend: 'dest-in' },
    ])
    .png()
    .toBuffer()

  const parts: OverlayOptions[] = [{ input: card, left: 0, top: 0 }]

  const printTop = Math.round(mount * 0.055)
  parts.push({ input: top1, left: center(await widthOf(top1)), top: printTop })
  parts.push({ input: top2, left: center(await widthOf(top2)), top: printTop + Math.ceil(printSize * 1.4) + printGap })

  // The stamp goes in the top corner, clear of the centered lab line.
  if (stampLine) {
    parts.push({
      input: stampLine,
      left: mount - pad - (await widthOf(stampLine)),
      top: printTop,
    })
  }

  const frameTop = Math.round((mount - frameH) / 2)
  parts.push({
    input: Buffer.from(
      `<svg width="${frameW}" height="${frameH}" xmlns="http://www.w3.org/2000/svg">` +
      `<rect width="${frameW}" height="${frameH}" fill="${SLIDE.window}"/></svg>`
    ),
    left: center(frameW),
    top: frameTop,
  })
  parts.push({ input: fitted, left: center(photoW), top: frameTop + bezel })

  const cross = Math.round(mount * 0.022)
  const crossMark = Buffer.from(
    `<svg width="${cross}" height="${cross}" xmlns="http://www.w3.org/2000/svg">` +
    `<path d="M${cross / 2} 0 V${cross} M0 ${cross / 2} H${cross}" stroke="${SLIDE.print}" stroke-width="${Math.max(1, Math.round(cross * 0.12))}"/></svg>`
  )
  for (const x of [pad, mount - pad - cross]) {
    parts.push({ input: crossMark, left: x, top: frameTop + Math.round(frameH / 2 - cross / 2) })
  }

  if (metaImage) {
    const written = await sharp(metaImage)
      .rotate((seeded(ctx.seed, 41) - 0.5) * 3.2, { background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .toBuffer()
    parts.push({
      input: written,
      left: center(await widthOf(written)),
      top: frameTop + frameH + Math.round(mount * 0.012),
    })
  }

  const baseline = mount - Math.round(mount * 0.055) - Math.ceil(subSize * 1.4)
  parts.push({ input: labLine, left: center(await widthOf(labLine)), top: baseline })
  parts.push(...(await grainLayer(mount, mount)))
  // Last, always: every tiled overlay above covers the full square, corners
  // included, so the board has to be cut to shape after the final one.
  parts.push({ input: shape, blend: 'dest-in' })

  const board = await sharp({
    create: { width: mount, height: mount, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite(parts)
    .png()
    .toBuffer()

  const upright = portrait ? await sharp(board).rotate(-90).toBuffer() : board

  return encode(canvas, canvas, palette.paper, [{ input: upright, left: outer, top: outer }], quality)
}

async function renderExport(params: RenderContext & { style: ExportStyle; quality: number }): Promise<Buffer> {
  const { style, quality, ...ctx } = params
  if (style === 'bare') return renderBare(ctx, quality)
  if (style === 'sprocket') return renderSprocket(ctx, quality, false)
  if (style === 'slide') return renderSlide(ctx, quality)
  if (style === 'negative') return renderSprocket(ctx, quality, true)
  return renderClean(ctx, quality)
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const photoId = searchParams.get('id')
  const isPreview = searchParams.get('preview') === '1'

  const styleParam = searchParams.get('style')
  const style: ExportStyle = isExportStyle(styleParam) ? styleParam : 'clean'
  const formatParam = searchParams.get('format')
  const format: ExportFormat = isExportFormat(formatParam) ? formatParam : 'post'
  const theme: keyof typeof THEMES = searchParams.get('theme') === 'dark' ? 'dark' : 'light'

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
