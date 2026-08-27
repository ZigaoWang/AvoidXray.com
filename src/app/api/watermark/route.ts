import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
// sharp 0.35 dropped the `sharp.X` type namespace in favour of named type
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

export type ExportFormat = 'post' | 'square' | 'story' | 'original'
export type ExportStyle = 'bare' | 'clean' | 'sprocket' | 'negative' | 'slide'

function isExportStyle(value: string | null): value is ExportStyle {
  return value === 'bare' || value === 'clean' || value === 'sprocket'
    || value === 'negative' || value === 'slide'
}

function isExportFormat(value: string | null): value is ExportFormat {
  return value === 'post' || value === 'square' || value === 'story' || value === 'original'
}

// Load and cache font files as base64 once at startup
const fontsDir = path.join(process.cwd(), 'public', 'fonts')
const FONT_BASE64 = {
  regular: fs.readFileSync(path.join(fontsDir, 'Inter-Regular.ttf')).toString('base64'),
  medium: fs.readFileSync(path.join(fontsDir, 'Inter-Medium.ttf')).toString('base64'),
  semibold: fs.readFileSync(path.join(fontsDir, 'Inter-SemiBold.ttf')).toString('base64'),
  bold: fs.readFileSync(path.join(fontsDir, 'Inter-Bold.ttf')).toString('base64'),
  mono: fs.readFileSync(path.join(fontsDir, 'JetBrainsMono-Bold.ttf')).toString('base64')
}

// Also register fonts for canvas (for local development)
try {
  registerFont(path.join(fontsDir, 'Inter-Regular.ttf'), { family: 'Inter', weight: '400' })
  registerFont(path.join(fontsDir, 'Inter-Medium.ttf'), { family: 'Inter', weight: '500' })
  registerFont(path.join(fontsDir, 'Inter-SemiBold.ttf'), { family: 'Inter', weight: '600' })
  registerFont(path.join(fontsDir, 'Inter-Bold.ttf'), { family: 'Inter', weight: '700' })
  registerFont(path.join(fontsDir, 'JetBrainsMono-Bold.ttf'), { family: 'JetBrains Mono', weight: '700' })
  console.log('✅ Canvas fonts registered successfully')
} catch (error) {
  console.error('❌ Failed to register canvas fonts:', error)
}

// The wide wordmark, 307x56. The stacked 150x117 mark was unreadable at any
// height that did not dominate the caption.
// Named for the background it goes on, not for its own colour: logo.svg is a
// white box with black lettering, so it needs something dark behind it.
const WORDMARK = {
  onLight: fs.readFileSync(path.join(process.cwd(), 'public', 'logo-inverted.svg'), 'utf-8'),
  onDark: fs.readFileSync(path.join(process.cwd(), 'public', 'logo.svg'), 'utf-8'),
}

async function fetchImage(url: string): Promise<Buffer> {
  const response = await fetch(url)
  if (!response.ok) throw new Error('Failed to fetch image')
  return Buffer.from(await response.arrayBuffer())
}

// Create text image using canvas with custom fonts, with SVG fallback
async function createTextImage(
  text: string,
  fontSize: number,
  color: string,
  options: { weight?: number; letterSpacing?: number; align?: 'left' | 'center' | 'right'; width?: number; fontStyle?: 'sans' | 'mono' } = {}
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
  options: { weight?: number; letterSpacing?: number; align?: 'left' | 'center' | 'right'; width?: number; fontStyle?: 'sans' | 'mono' } = {}
): Buffer {
  const { weight = 400, letterSpacing = 0, align = 'left', width, fontStyle = 'sans' } = options

  // Select font family based on style
  let fontFamily = 'Inter'
  let fontWeight = weight.toString()

  if (fontStyle === 'mono') {
    fontFamily = 'JetBrains Mono'
    fontWeight = '700'
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
  options: { weight?: number; letterSpacing?: number; align?: 'left' | 'center' | 'right'; width?: number; fontStyle?: 'sans' | 'mono' } = {}
): Promise<Buffer> {
  const { weight = 400, letterSpacing = 0, align = 'left', width, fontStyle = 'sans' } = options

  // Select font base64 based on weight and style
  let fontBase64: string
  let fontFamily = 'Inter'

  if (fontStyle === 'mono') {
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

/**
 * Where the export is going. The canvas is decided before anything is
 * rendered, which is the whole difference from the old path: it fetched a
 * 6000px, 50MB scan across the Pacific, composited at 25 megapixels, encoded a
 * full-size PNG and only then shrank it to a preview.
 */
const CANVAS: Record<Exclude<ExportFormat, 'original'>, { w: number; h: number }> = {
  post: { w: 1080, h: 1350 },
  square: { w: 1080, h: 1080 },
  story: { w: 1080, h: 1920 },
}

/** Long edge for the "as shot" format, which keeps the photograph's own ratio. */
const ORIGINAL_LONG_EDGE = 1600

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
} as const

/**
 * A tile of film grain, built once at startup and repeated across the frame.
 * The previous renderer generated 160,000 random pixels on every request.
 */
const GRAIN = (async () => {
  const size = 256
  const data = Buffer.alloc(size * size * 4)
  for (let i = 0; i < size * size; i++) {
    const noise = 128 + Math.round((Math.random() - 0.5) * 30)
    data[i * 4] = noise
    data[i * 4 + 1] = noise
    data[i * 4 + 2] = noise
    data[i * 4 + 3] = 30
  }
  return sharp(data, { raw: { width: size, height: size, channels: 4 } }).png().toBuffer()
})()

/** Grain laid over the whole frame, as an overlay so it darkens and lifts. */
async function grainLayer(): Promise<OverlayOptions> {
  return { input: await GRAIN, tile: true, blend: 'overlay' }
}

/**
 * Card stock: coarser than film grain and warm, with slow mottling so a mount
 * reads as pressed board rather than a flat fill.
 */
const CARD_TEXTURE = (async () => {
  const size = 320
  const data = Buffer.alloc(size * size * 4)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4
      const mottle = Math.sin(x * 0.045) * 4 + Math.cos(y * 0.037) * 4
      const fibre = (Math.random() - 0.5) * 26
      const value = 128 + mottle + fibre
      data[i] = Math.max(0, Math.min(255, value + 6))
      data[i + 1] = Math.max(0, Math.min(255, value + 2))
      data[i + 2] = Math.max(0, Math.min(255, value - 6))
      data[i + 3] = 96
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
  maxWidth: number, fontStyle?: 'sans' | 'mono'
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
  theme: keyof typeof THEMES
  caption: string
  camera: string
  film: string
  username: string
  date: string
  qrUrl: string | null
}

/** Canvas width, and the fixed height when the format dictates one. */
function canvasBase(format: ExportFormat, srcW: number, srcH: number, matRatio: number) {
  if (format !== 'original') return { width: CANVAS[format].w, fixedHeight: CANVAS[format].h as number | null }
  const scale = Math.min(1, ORIGINAL_LONG_EDGE / Math.max(srcW, srcH))
  const w = Math.round(srcW * scale)
  const h = Math.round(srcH * scale)
  return { width: w + Math.round(Math.max(w, h) * matRatio) * 2, fixedHeight: null }
}

async function encode(canvasW: number, canvasH: number, paper: string, composites: OverlayOptions[], quality: number) {
  return sharp({ create: { width: canvasW, height: canvasH, channels: 3, background: hexToRgb(paper) } })
    .composite(composites)
    .jpeg({ quality, mozjpeg: true })
    .toBuffer()
}

/** Nothing but the photograph and an even mat. */
async function renderBare(ctx: RenderContext, quality: number): Promise<Buffer> {
  const palette = THEMES[ctx.theme]
  // 0 is edge to edge, 100 is a wide gallery mat.
  const ratio = 0.005 + (ctx.mat / 100) * 0.115
  const { width: canvasW, fixedHeight } = canvasBase(ctx.format, ctx.srcW, ctx.srcH, ratio)
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
  }, await grainLayer()], quality)
}

/** Gallery print: photograph, centred caption, wordmark. */
async function renderClean(ctx: RenderContext, quality: number): Promise<Buffer> {
  const palette = THEMES[ctx.theme]
  const { width: canvasW, fixedHeight } = canvasBase(ctx.format, ctx.srcW, ctx.srcH, 0.043)
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

  const centre = (w: number) => Math.round((canvasW - w) / 2)
  const composites: OverlayOptions[] = [{
    input: Buffer.from(
      `<svg width="${photoW + 2}" height="${photoH + 2}"><rect x="0.5" y="0.5" width="${photoW + 1}" height="${photoH + 1}" fill="none" stroke="${palette.hairline}" stroke-width="1"/></svg>`
    ),
    left: photoLeft - 1,
    top: photoTop - 1,
  }, { input: fitted, left: photoLeft, top: photoTop }]

  let cursorY = photoTop + photoH + gap
  for (const [i, buffer] of rendered.entries()) {
    composites.push({ input: buffer, left: centre(await widthOf(buffer)), top: cursorY })
    cursorY += lineHeights[i] + lineGap
  }

  cursorY += logoGap - (lines.length ? lineGap : 0)
  const markLeft = centre(markRowW)
  composites.push({ input: logo, left: markLeft, top: cursorY + Math.round((markRowH - logoHeight) / 2) })

  if (ctx.qrUrl) {
    const qr = await QRCode.toBuffer(ctx.qrUrl, { width: qrSize, margin: 2, color: { dark: '#000000', light: '#FFFFFF' } })
    composites.push({ input: qr, left: markLeft + logoW + qrGap, top: cursorY + Math.round((markRowH - qrSize) / 2) })
  }
  composites.push(await grainLayer())

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
const REBATE_NOISE = (async () => {
  const size = 96
  const data = Buffer.alloc(size * size * 4)
  for (let i = 0; i < size * size; i++) {
    const noise = 128 + Math.round((Math.random() - 0.5) * 90)
    data[i * 4] = noise
    data[i * 4 + 1] = noise
    data[i * 4 + 2] = noise
    data[i * 4 + 3] = 10
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
  const portrait = ctx.srcH > ctx.srcW
  const { width: reqW, fixedHeight } = canvasBase(ctx.format, ctx.srcW, ctx.srcH, 0.16)
  const reqH = fixedHeight ?? Math.round(reqW * (ctx.srcH / ctx.srcW))

  // Strip space: length across, film width down. Turned back at the end.
  const stripLen = portrait ? reqH : reqW
  const stripWid = portrait ? reqW : reqH
  const aspect = Math.max(ctx.srcW, ctx.srcH) / Math.min(ctx.srcW, ctx.srcH)

  // The frame, its two interframe gaps and a sliver of each neighbour all have
  // to fit within the canvas: the strip runs off the ends, the frame does not.
  const sliverRatio = 0.06
  const lengthPerWidth = F.imageHeight * aspect * (1 + sliverRatio * 2) + F.interframe * 2
  const W = Math.max(120, Math.min(stripWid, Math.floor(stripLen / lengthPerWidth)))

  const px = (fraction: number) => Math.round(fraction * W)
  const imageH = px(F.imageHeight)
  const frameLen = Math.round(imageH * aspect)
  const gapLen = px(F.interframe)
  const sliver = Math.round(frameLen * sliverRatio)

  const stripTop = Math.round((stripWid - W) / 2)
  const frameX = Math.round((stripLen - frameLen) / 2)
  const imageY = stripTop + px(F.imageTop)

  // --- film base and neighbouring frames ---
  const rebateParts: string[] = [`<rect x="0" y="${stripTop}" width="${stripLen}" height="${W}" fill="${FILM.base}"/>`]

  for (const side of [-1, 1]) {
    const x = side < 0 ? frameX - gapLen - sliver : frameX + frameLen + gapLen
    rebateParts.push(`<rect x="${x}" y="${imageY}" width="${sliver}" height="${imageH}" fill="${FILM.adjacent}"/>`)
  }

  const rebate = Buffer.from(
    `<svg width="${stripLen}" height="${stripWid}" xmlns="http://www.w3.org/2000/svg">` +
    `<rect width="${stripLen}" height="${stripWid}" fill="${FILM.base}"/>${rebateParts.join('')}</svg>`
  )

  const parts: string[] = []

  const pitch = px(F.pitch)
  const holeLen = px(F.holeLength)
  const holeDepth = px(F.perfDepth)
  const radius = Math.max(1, Math.round(holeDepth * 0.26))
  const rowYs = [stripTop + px(F.perfTop), stripTop + W - px(F.perfTop) - holeDepth]
  const jitter = px(F.jitter)

  // Holes belong to the strip, so they carry on past both ends of the canvas.
  for (let i = -2; i * pitch < stripLen + pitch * 2; i++) {
    const offset = Math.round((seeded(ctx.seed, i * 31) - 0.5) * 2 * jitter)
    const grow = Math.round((seeded(ctx.seed, i * 57) - 0.5) * 2 * jitter)
    const x = i * pitch + offset
    for (const y of rowYs) {
      // A hair of a darker ring at the edge, where the light wrapped the punch.
      parts.push(
        `<rect x="${x}" y="${y}" width="${holeLen + grow}" height="${holeDepth}" rx="${radius}" ` +
        `fill="${FILM.hole}" stroke="${FILM.holeEdge}" stroke-width="1"/>`
      )
    }
  }

  const perforations = Buffer.from(
    `<svg width="${stripLen}" height="${stripWid}" xmlns="http://www.w3.org/2000/svg">${parts.join('')}</svg>`
  )

  // --- the exposure ---
  let source = ctx.photo
  if (portrait) source = source.rotate(90)
  let pipeline = source.resize(frameLen, imageH, { fit: 'cover' })
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

  // --- edge printing, in the outer margins only ---
  const type = Math.max(7, px(0.030))
  const marginH = px(F.margin)
  const topY = stripTop + Math.round((marginH - Math.ceil(type * 1.4)) / 2)
  const bottomY = stripTop + W - marginH + Math.round((marginH - Math.ceil(type * 1.4)) / 2)
  const number = 1 + Math.floor(seeded(ctx.seed, 7) * 36)

  const label = (text: string) =>
    createTextImage(text, type, FILM.edge, { weight: 700, letterSpacing: Math.max(1, Math.round(type * 0.14)), fontStyle: 'mono' })

  const filmName = await label((ctx.film || 'AVOIDXRAY').toUpperCase())
  const bottomNumber = await label(`${number}  ${number}A  ▶`)
  const handle = await label((ctx.username ? '@' + ctx.username : 'AVOIDXRAY').toUpperCase())

  // Thin bars, about an eighth of a perforation's depth, running as long as
  // the margin allows between the frame numbers and the handle.
  const unit = Math.max(1, Math.round(W * 0.0025))
  const barH = Math.max(1, Math.round(holeDepth / 8))
  const rowGap = Math.max(1, Math.round(barH * 0.9))
  const bottomNumberW = await widthOf(bottomNumber)
  const handleW = await widthOf(handle)
  const pad = Math.round(W * 0.025)
  const dxRun = Math.max(unit * 8, frameLen - bottomNumberW - handleW - pad * 2)
  const dx = dxBars(ctx.seed, unit, dxRun, barH, rowGap)
  const dxW = await widthOf(dx)
  const dxY = stripTop + W - marginH + Math.round((marginH - (barH * 2 + rowGap)) / 2)

  // Halation: the exposure blurred and screened back over the rebate around it,
  // dying out within 3% of the canvas width of the frame edge.
  const spread = Math.max(4, Math.round(reqW * 0.03))
  // Scaled down and left opaque: screen can then only lighten, so the glow
  // never leaves a dark ring inset around the frame.
  const halation = await sharp(frame)
    .resize(frameLen + spread * 2, imageH + spread * 2, { fit: 'fill' })
    .blur(spread * 0.9)
    .linear(0.22, 0)
    .toBuffer()

  const composites: OverlayOptions[] = [
    { input: rebate, left: 0, top: 0 },
    { input: await REBATE_NOISE, tile: true, blend: 'overlay' },
    { input: halation, left: frameX - spread, top: imageY - spread, blend: 'screen' },
    { input: perforations, left: 0, top: 0 },
    { input: frame, left: frameX, top: imageY },
    // Top margin: the stock name once, in the upper third, rebate either side.
    { input: filmName, left: frameX + Math.round(frameLen * 0.08), top: topY },
    // Bottom margin: numbers, then the code, then the handle.
    { input: bottomNumber, left: frameX, top: bottomY },
    { input: dx, left: frameX + bottomNumberW + pad, top: dxY },
    { input: handle, left: frameX + bottomNumberW + pad + dxW + pad, top: bottomY },
    await grainLayer(),
  ]

  const strip = await sharp({
    create: { width: stripLen, height: stripWid, channels: 3, background: hexToRgb(FILM.base) },
  })
    .composite(composites)
    .png()
    .toBuffer()

  const finished = portrait ? await sharp(strip).rotate(-90).toBuffer() : strip
  return sharp(finished).jpeg({ quality, mozjpeg: true }).toBuffer()
}

async function renderSlide(ctx: RenderContext, quality: number): Promise<Buffer> {
  const palette = THEMES[ctx.theme]

  // A mount is square, so the canvas is too, and the board fills it evenly.
  const canvas = ctx.format === 'original'
    ? Math.round(Math.min(ORIGINAL_LONG_EDGE, Math.max(ctx.srcW, ctx.srcH)))
    : Math.min(CANVAS[ctx.format].w, CANVAS[ctx.format].h)
  const outer = Math.round(canvas * 0.045)
  const mount = canvas - outer * 2
  const radius = Math.round(mount * 0.06)

  const printSize = Math.max(8, Math.round(mount * 0.032))
  const metaSize = Math.max(7, Math.round(mount * 0.018))
  const track = (size: number) => Math.max(1, Math.round(size * 0.12))
  const printGap = Math.round(mount * 0.012)
  const bezel = Math.round(mount * 0.02)

  const line1 = ctx.film || 'Film'
  const line2 = ctx.filmFormat || '35mm'
  const top1 = await renderCaptionLine(line1, printSize, SLIDE.print, 400, track(printSize), mount)
  const top2 = await renderCaptionLine(line2, printSize, SLIDE.print, 400, track(printSize), mount)
  const printH = Math.ceil(printSize * 1.4) * 2 + printGap

  const meta = [ctx.camera, ctx.film].filter(Boolean).join('  ·  ')
  const metaImage = meta ? await renderCaptionLine(meta, metaSize, SLIDE.ink, 400, track(metaSize), mount) : null
  const metaH = metaImage ? Math.ceil(metaSize * 1.4) + Math.round(mount * 0.016) : 0

  // The aperture is 62% of the board, whichever way the frame runs.
  const aperture = Math.round(mount * 0.78)
  const fitted = await ctx.photo.resize(aperture, aperture, { fit: 'inside' }).toBuffer()
  const fm = await sharp(fitted).metadata()
  const photoW = fm.width || aperture
  const photoH = fm.height || aperture
  const frameW = photoW + bezel * 2
  const frameH = photoH + bezel * 2

  const mountLeft = outer
  const mountTop = outer
  const centre = (w: number) => mountLeft + Math.round((mount - w) / 2)

  // The texture tile covers the full rectangle, corners included, so the board
  // is cut to shape again afterwards. Without the second pass the rounded
  // corners came back as four textured squares.
  const shape = Buffer.from(
    `<svg width="${mount}" height="${mount}" xmlns="http://www.w3.org/2000/svg">` +
    `<rect width="${mount}" height="${mount}" rx="${radius}" fill="#FFFFFF"/></svg>`
  )
  const card = await sharp(Buffer.from(
    `<svg width="${mount}" height="${mount}" xmlns="http://www.w3.org/2000/svg">` +
    `<rect width="${mount}" height="${mount}" rx="${radius}" fill="${SLIDE.mount}"/></svg>`
  ))
    .composite([
      { input: await CARD_TEXTURE, tile: true, blend: 'overlay' },
      { input: shape, blend: 'dest-in' },
    ])
    .png()
    .toBuffer()

  const composites: OverlayOptions[] = [{ input: card, left: mountLeft, top: mountTop }]

  const printTop = mountTop + Math.round(mount * 0.055)
  composites.push({ input: top1, left: centre(await widthOf(top1)), top: printTop })
  composites.push({ input: top2, left: centre(await widthOf(top2)), top: printTop + Math.ceil(printSize * 1.4) + printGap })

  const frameTop = mountTop + Math.round((mount - frameH) / 2)
  composites.push({
    input: Buffer.from(
      `<svg width="${frameW}" height="${frameH}" xmlns="http://www.w3.org/2000/svg">` +
      `<rect width="${frameW}" height="${frameH}" fill="${SLIDE.window}"/></svg>`
    ),
    left: centre(frameW),
    top: frameTop,
  })
  composites.push({ input: fitted, left: centre(photoW), top: frameTop + bezel })

  if (metaImage) {
    composites.push({
      input: metaImage,
      left: centre(await widthOf(metaImage)),
      top: frameTop + frameH + Math.round(mount * 0.016),
    })
  }

  const flip1 = await sharp(top1).rotate(180).toBuffer()
  const flip2 = await sharp(top2).rotate(180).toBuffer()
  const printBottom = mountTop + mount - Math.round(mount * 0.055) - printH
  composites.push({ input: flip2, left: centre(await widthOf(flip2)), top: printBottom })
  composites.push({ input: flip1, left: centre(await widthOf(flip1)), top: printBottom + Math.ceil(printSize * 1.4) + printGap })
  composites.push(await grainLayer())

  return encode(canvas, canvas, palette.paper, composites, quality)
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
  const customCaption = searchParams.get('caption') ?? 'Shot on film'
  const matWidth = Math.min(100, Math.max(0, asInt(searchParams.get('mat')) ?? 45))

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
    // The medium variant, not the original. Nothing here is rendered above
    // 1920px, and the originals run to 6140px and 50MB — on storage that is a
    // Pacific crossing away from this server, that fetch was most of the wait.
    // The original is used only when there is no medium to work from.
    const source = await fetchImage(photo.mediumPath || photo.originalPath)

    const camera = showCamera ? (photo.camera?.name || '') : ''
    const film = showFilm ? (photo.filmStock?.name || '') : ''
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

    const output = await renderExport({
      photo: rotated,
      seed: photoId,
      mat: matWidth,
      filmFormat: (Array.isArray(photo.filmStock?.format)
        ? photo.filmStock?.format[0]
        : photo.filmStock?.format) || '35mm',
      srcW: sourceMeta.width || 1000,
      srcH: sourceMeta.height || 1000,
      style,
      format,
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

    return new NextResponse(new Uint8Array(output), {
      headers: {
        'Content-Type': 'image/jpeg',
        'Content-Disposition': isPreview ? 'inline' : `attachment; filename="avoidxray-${photoId}-${format}.jpg"`,
        'Cache-Control': isPreview ? 'private, max-age=60' : 'no-store'
      }
    })
  } catch (error) {
    console.error('Export generation error:', error)
    return NextResponse.json({ error: 'Failed to generate the export' }, { status: 500 })
  }
}
