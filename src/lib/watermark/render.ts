/**
 * The export renderer: five styles, drawn with sharp onto a decided canvas.
 *
 * Lifted out of src/app/api/watermark/route.ts, where every one of these was
 * module-private and so unreachable from a test. That is not a detail — it is
 * why a slide export ignored the chosen format for as long as it did, returning
 * three byte-identical files while the dialog drew three different aspect
 * swatches above them. Nothing anywhere could assert what any of them produced.
 *
 * The route keeps what belongs to a request: reading parameters, authorizing,
 * fetching the source, holding a render slot. This keeps what belongs to the
 * picture, and scripts/test/exportGeometry.test.ts can now ask it questions.
 */
import sharp, { type Channels, type OverlayOptions, type Sharp } from 'sharp'
import fs from 'fs'
import path from 'path'
import QRCode from 'qrcode'
import { createCanvas, registerFont } from 'canvas'
import {
  ORIGINAL_LONG_EDGE,
  canvasOf,
  type ExportFormat,
  type ExportStyle,
  type ExportTheme,
} from '@/lib/exportFormats'

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
/**
 * The mark as it is set in an export, which is all capitals.
 *
 * BRANDING.md gives exactly one form for an all-caps context, and it is the
 * bare word: the domain is only ever written "AvoidXray.com". The edge
 * printing, the handle fallback and the slide mount's lab line all read
 * "AVOIDXRAY.COM", which is a form the guide does not allow — on the most
 * public artifact the site makes, and the one nobody can correct afterwards.
 */
const WORDMARK_TEXT = 'AVOIDXRAY'

const WORDMARK = {
  onLight: fs.readFileSync(path.join(process.cwd(), 'public', 'logo-inverted.svg'), 'utf-8'),
  onDark: fs.readFileSync(path.join(process.cwd(), 'public', 'logo.svg'), 'utf-8'),
}

// Create text image using canvas with custom fonts, with SVG fallback
async function createTextImage(
  text: string,
  fontSize: number,
  color: string,
  options: { weight?: number; letterSpacing?: number; align?: 'left' | 'center' | 'right'; width?: number; fontStyle?: 'sans' | 'mono' | 'hand' } = {}
): Promise<Buffer> {
  try {
    // Try canvas approach first (better quality, works if canvas is properly installed)
    return createTextImageCanvas(text, fontSize, color, options)
  } catch (error) {
    console.warn('Canvas text rendering failed, falling back to SVG:', error)
    // Fallback to SVG with embedded fonts
    return await createTextImageSVG(text, fontSize, color, options)
  }
}

/**
 * How wide a run of text will be drawn, without drawing it.
 *
 * The drawing loop advances per character so that letter spacing applies
 * between every pair; the measurement has to walk the same way or the two
 * disagree. Kept as one function for that reason.
 *
 * A measuring canvas is 1x1 and costs nothing. Rasterizing a line to find out
 * how wide it is costs a PNG encode and a decode, which is what the line
 * fitting below used to do up to five times per line.
 */
function measureRun(
  text: string, fontSize: number, fontFamily: string, fontWeight: string, letterSpacing: number
): number {
  const ctx = createCanvas(1, 1).getContext('2d')
  ctx.font = `${fontWeight} ${fontSize}px "${fontFamily}"`
  // By character rather than by code unit. Indexing a string gives halves of a
  // surrogate pair, so an emoji was measured as two full advances and drawn as
  // two replacement glyphs: "Golden hour 🎞 café" came out with a pair of boxes
  // in the middle and measured about twice its real width, which then made the
  // fitting below shorten a line that would have fitted.
  const characters = [...text]
  let width = 0
  characters.forEach((character, i) => {
    width += ctx.measureText(character).width
    if (i < characters.length - 1) width += letterSpacing
  })
  return width
}

/** The family and weight a style resolves to, so measuring matches drawing. */
function faceFor(weight: number, fontStyle: 'sans' | 'mono' | 'hand') {
  if (fontStyle === 'mono') return { fontFamily: 'JetBrains Mono', fontWeight: '700' }
  if (fontStyle === 'hand') return { fontFamily: 'Kalam', fontWeight: '400' }
  return { fontFamily: 'Inter', fontWeight: weight.toString() }
}

// Canvas-based text rendering (preferred)
function createTextImageCanvas(
  text: string,
  fontSize: number,
  color: string,
  options: { weight?: number; letterSpacing?: number; align?: 'left' | 'center' | 'right'; width?: number; fontStyle?: 'sans' | 'mono' | 'hand' } = {}
): Buffer {
  const { weight = 400, letterSpacing = 0, align = 'left', width, fontStyle = 'sans' } = options

  const { fontFamily, fontWeight } = faceFor(weight, fontStyle)

  const textWidth = measureRun(text, fontSize, fontFamily, fontWeight, letterSpacing)
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

  // Draw text with letter spacing, by character rather than by code unit so a
  // surrogate pair is one glyph rather than two boxes.
  let currentX = x
  for (const character of text) {
    ctx.fillText(character, currentX, fontSize * 0.05)
    currentX += ctx.measureText(character).width + letterSpacing
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
  const { fontFamily, fontWeight } = faceFor(weight, fontStyle ?? 'sans')
  const drawnWidth = (value: string) =>
    Math.ceil(measureRun(value, size, fontFamily, fontWeight, letterSpacing) + size * 0.2)

  // Measured rather than rasterized. This drew the line, encoded it to PNG and
  // decoded it through sharp purely to read a width, then threw it away and did
  // it again — up to five times for one caption.
  const characters = [...text]
  let current = text
  for (let attempt = 0; attempt < 5; attempt++) {
    const width = drawnWidth(current)
    const held = [...current].length
    if (width <= maxWidth || held <= 4) break
    const keep = Math.max(3, Math.floor(held * (maxWidth / width)) - 1)
    current = `${characters.slice(0, keep).join('').trimEnd()}…`
  }
  return createTextImage(current, size, color, { weight, letterSpacing, fontStyle })
}

const widthOf = async (buffer: Buffer) => (await sharp(buffer).metadata()).width || 0

/**
 * Pixels handed from one sharp call to the next without an encode in between.
 *
 * `.toBuffer()` with no format named re-encodes in the input's own format, so a
 * chain of intermediate buffers quietly spent a WebP or JPEG round trip at every
 * step — lossy, on a picture still being built, purely to hand it to the next
 * line. Raw costs more memory for the moment it is held and nothing else.
 */
type RawFrame = { data: Buffer; info: { width: number; height: number; channels: number } }

const rawSpec = (frame: RawFrame) => ({
  width: frame.info.width,
  height: frame.info.height,
  channels: frame.info.channels as Channels,
})

const fromRaw = (frame: RawFrame) => sharp(frame.data, { raw: rawSpec(frame) })

const rawOverlay = (
  frame: RawFrame, left: number, top: number, blend?: OverlayOptions['blend']
): OverlayOptions => ({ input: frame.data, raw: rawSpec(frame), left, top, ...(blend ? { blend } : {}) })

export interface RenderContext {
  photo: Sharp
  /** Mat width for the bare style, 0-100. */
  mat: number
  /** Film format, printed on the slide mount. */
  filmFormat: string
  /** "Color slide" / "Black & white negative", or empty when not both known. */
  filmKind: string
  /** What the stock is, for the treatments that depend on knowing. */
  stock: Stock
  /** Photo id, so per-frame variation is stable between preview and download. */
  seed: string
  srcW: number
  srcH: number
  format: ExportFormat
  /** Whole multiple of the canvas this is rendered at. See RESOLUTION. */
  scale: number
  /** Whether the canvas lies on its side. Square and "as shot" ignore it. */
  landscape: boolean
  theme: ExportTheme
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

  const fitted = await ctx.photo.resize(frameW, frameH, { fit: 'inside', withoutEnlargement: true }).toBuffer()
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

  const fitted = await ctx.photo.resize(frameW, frameH, { fit: 'inside', withoutEnlargement: true }).toBuffer()
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

/**
 * What the catalog knows about the stock, which is what makes this a
 * photograph of a particular film rather than a generic border.
 *
 * All of it was already being loaded on every render and thrown away: the route
 * asked for the whole FilmStock row and read the name and the format off it.
 */
export interface Stock {
  /** The speed, printed on the rebate and encoded in the code beside it. */
  iso: number | null
  /** The maker, which decides the color of the edge printing. */
  brand: string
  monochrome: boolean
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

/**
 * Edge printing, in the maker's own ink.
 *
 * Every manufacturer prints the rebate in its own color and has for decades —
 * it is how you tell one strip from another on a lightbox at arm's length, and
 * it is the detail that makes a strip read as Tri-X rather than as a generic
 * piece of film. Every export used Kodak's orange regardless of what was in the
 * camera.
 *
 * Matched on the brand string the catalog already stores. Anything unrecognised
 * keeps the orange, which is the most common answer by a wide margin.
 */
const EDGE_INK: { match: RegExp; ink: string }[] = [
  { match: /kodak/i, ink: '#E9A23B' },
  { match: /fuji/i, ink: '#63C07A' },
  { match: /ilford|harman|kentmere/i, ink: '#EDE7DA' },
  { match: /agfa|adox/i, ink: '#E2564B' },
  { match: /cinestill/i, ink: '#5FB4E0' },
  { match: /lomo/i, ink: '#F2C14E' },
  { match: /ferrania/i, ink: '#D8A24A' },
  { match: /rollei|foma/i, ink: '#C9D1D9' },
]

function edgeInk(stock: Stock): string {
  // A monochrome stock is printed in a neutral ink whoever made it; the colored
  // rebates belong to color emulsions.
  if (stock.monochrome) return '#EDE7DA'
  return EDGE_INK.find(entry => entry.match.test(stock.brand))?.ink ?? FILM.edge
}

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
/** A black-and-white negative's base: very slightly warm, near neutral. */
const MONOCHROME_BASE = '#EDEAE4'

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

/** Whether a stock's name already states its speed, as most of them do. */
function carriesSpeed(name: string, iso: number): boolean {
  return new RegExp(`(^|[^0-9])${iso}([^0-9]|$)`).test(name)
}

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
function dxBars(seed: string, unit: number, length: number, barH: number, rowGap: number, stock: Stock, ink: string): Buffer {
  // The speed, as the six-bit index a real DX code carries. ISO 25 is index 1
  // and every third of a stop steps it by one, which is what the doubling
  // logarithm below works out. Not the whole standard — latitude and the
  // exposure count are two further fields — but the bars now say something
  // true about the film rather than being noise seeded from a row id.
  const speed = stock.iso && stock.iso > 0
    ? Math.max(1, Math.min(63, Math.round(3 * Math.log2(stock.iso / 25)) + 1))
    : null

  const wide = (index: number) => speed === null
    ? seeded(seed, 900 + index) > 0.5
    // Bit 0 of a DX row is the guard bar and is always wide.
    : index === 0 || ((speed >> (index - 1)) & 1) === 1

  const bars: string[] = []
  let x = 0
  let i = 0
  // Every bar the same height; only the width varies, and the gap never does.
  while (x < length) {
    const w = unit * (wide(i) ? 2 : 1)
    if (x + w > length) break
    bars.push(`<rect x="${x}" y="0" width="${w}" height="${barH}" fill="${ink}"/>`)
    bars.push(`<rect x="${x}" y="${barH + rowGap}" width="${w}" height="${barH}" fill="${ink}"/>`)
    x += w + unit
    i++
  }
  const height = barH * 2 + rowGap
  return Buffer.from(
    `<svg width="${Math.max(1, Math.round(x))}" height="${height}" xmlns="http://www.w3.org/2000/svg">${bars.join('')}</svg>`
  )
}

/**
 * The strip this style will build, worked out without building it.
 *
 * Exported because the route has to report what an export will measure before
 * it has rendered one, and this is the one style whose canvas does not simply
 * scale: the width is capped by the photograph, so doubling the resolution does
 * not double the sheet. Extrapolating from a rendered preview told the dialog a
 * size up to 47% larger than the file it then handed over, on the two looks
 * that open at "as shot" by default.
 *
 * The renderer below reads its own geometry from here, so there is one answer
 * rather than a prediction and a result that can disagree.
 *
 * The cap: the image area is F.imageHeight of the strip's width, so a strip
 * wider than the source divided by that fraction is enlarging the scan to fill
 * a frame it cannot fill — paying for a twenty-megapixel intermediate to
 * produce something no sharper. The floor of 1500 keeps the smallest export
 * exactly as it was.
 */
export function sprocketStrip(scale: number, srcW: number, srcH: number) {
  const width = Math.max(1500, Math.min(1500 * scale, Math.round(Math.min(srcW, srcH) / F.imageHeight)))
  const imageHeight = Math.round(F.imageHeight * width)
  const aspect = Math.max(srcW, srcH) / Math.min(srcW, srcH)
  const length = Math.round(imageHeight * aspect)
  // Built lying down and turned at the end, so an upright frame comes out with
  // the strip running down its sides.
  const upright = srcH > srcW ? { w: width, h: length } : { w: length, h: width }
  return { width, imageHeight, length, upright }
}

/** The margin of paper the strip is laid on for the "as shot" sheet. */
export const SPROCKET_SHEET_MARGIN = 0.045

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
  const { width: W, imageHeight: imageH, length: stripLen } = sprocketStrip(ctx.scale, ctx.srcW, ctx.srcH)
  const px = (fraction: number) => Math.round(fraction * W)
  const frameLen = stripLen
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
  // The film's own constant, not the sheet's. A perforation is a hole — the
  // comment on FILM.hole says so — and the scanner's light comes straight
  // through it, so it is bright whatever colour paper the strip is laid on.
  // Painting it the paper colour only looked right by coincidence on white:
  // the Negative look ships on dark paper, where #0A0A0A on the #1A1310 film
  // base is a ratio of about 1.06:1 and the perforations simply vanished.
  const holeFill = FILM.hole
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
  if (invert) {
    pipeline = pipeline.negate({ alpha: false }).linear(0.82, 22)
    // Pulling the chroma down models a colour negative's muted dye inversion.
    // On a monochrome stock there is nothing to pull, so it is removed outright
    // instead, which keeps the base honest rather than faintly tinted.
    pipeline = ctx.stock.monochrome
      ? pipeline.modulate({ saturation: 0 })
      : pipeline.modulate({ saturation: 0.7 })
  }
  const exposure = await pipeline.raw().toBuffer({ resolveWithObject: true })
  // The orange mask belongs to a color negative and to nothing else. It is the
  // dye layer's own cast, and a black-and-white stock does not have one — a
  // Tri-X negative is a neutral grey base. Every inverted export wore the
  // orange regardless of what was in the camera.
  const mask = ctx.stock.monochrome ? MONOCHROME_BASE : NEGATIVE_MASK
  const frame: RawFrame = invert
    ? await fromRaw(exposure)
        .composite([{
          input: { create: { width: frameLen, height: imageH, channels: 3, background: hexToRgb(mask) } },
          blend: 'multiply',
        }])
        .raw()
        .toBuffer({ resolveWithObject: true })
    : exposure

  const type = Math.max(7, px(0.030))
  const marginH = px(F.margin)
  const topY = Math.round((marginH - Math.ceil(type * 1.4)) / 2)
  const bottomY = W - marginH + Math.round((marginH - Math.ceil(type * 1.4)) / 2)
  const number = 1 + Math.floor(seeded(ctx.seed, 7) * 36)
  const inset = Math.round(W * 0.035)
  const runLimit = Math.max(60, stripLen - inset * 2)

  const ink = edgeInk(ctx.stock)
  const label = (text: string) =>
    renderCaptionLine(text, type, ink, 700, Math.max(1, Math.round(type * 0.14)), runLimit, 'mono')

  // No placeholder: switching the film off used to print the word FILM in its
  // place, as did a photograph with no stock recorded. The edge carries the
  // mark alone when there is nothing to name.
  // Skipped when the name already carries it, which most of them do: Gold 200,
  // Portra 400, Ektar 100, Tri-X 400. The rebate read "KODAK GOLD 200  200".
  const speed = ctx.stock.iso && ctx.stock.iso > 0 && !carriesSpeed(ctx.film, ctx.stock.iso)
    ? `${ctx.stock.iso}`
    : ''
  const filmName = await label(
    [WORDMARK_TEXT, ctx.film, speed].filter(Boolean).join('  ').toUpperCase()
  )
  const bottomNumber = await label(`${number}  ${number}A  ▶`)
  const handle = await label((ctx.username ? '@' + ctx.username : WORDMARK_TEXT).toUpperCase())

  const unit = Math.max(1, Math.round(W * 0.0025))
  const barH = Math.max(1, Math.round(holeDepth / 8))
  const rowGap = Math.max(1, Math.round(barH * 0.9))
  const bottomNumberW = await widthOf(bottomNumber)
  const handleW = await widthOf(handle)
  const pad = Math.round(W * 0.025)
  const dxRun = Math.max(unit * 8, stripLen - inset * 2 - bottomNumberW - handleW - pad * 2)
  const dx = dxBars(ctx.seed, unit, dxRun, barH, rowGap, ctx.stock, ink)
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
  const reduced = await fromRaw(frame)
    .resize(Math.max(1, Math.round(frameLen / SHRINK)), Math.max(1, Math.round(glowH / SHRINK)), { fit: 'fill' })
    .blur((spread * 0.9) / SHRINK)
    .linear(0.22, 0)
    .raw()
    .toBuffer({ resolveWithObject: true })
  const halation = await fromRaw(reduced)
    .resize(frameLen, glowH, { fit: 'fill' })
    .raw()
    .toBuffer({ resolveWithObject: true })

  const strip = await sharp({
    create: { width: stripLen, height: W, channels: 3, background: hexToRgb(FILM.base) },
  })
    .composite([
      { input: rebate, left: 0, top: 0 },
      ...(await tiledLayer(REBATE_NOISE, REBATE_NOISE_SIZE, stripLen, W)),
      rawOverlay(halation, 0, Math.max(0, imageY - spread), 'screen'),
      { input: perforations, left: 0, top: 0 },
      rawOverlay(frame, 0, imageY),
      { input: filmName, left: inset, top: topY },
      { input: bottomNumber, left: inset, top: bottomY },
      { input: dx, left: inset + bottomNumberW + pad, top: dxY },
      { input: handle, left: Math.max(0, stripLen - inset - handleW), top: bottomY },
      ...(await grainLayer(stripLen, W)),
    ])
    // Raw pixels between the stages rather than PNG.
    //
    // The strip is a full frame of film grain, which is the worst case there is
    // for deflate: nothing repeats, so it compresses badly and slowly, and this
    // buffer was then decoded again to rotate it and a third time to fit it to
    // the sheet. Measured on grain at the size this actually builds, the three
    // steps together cost 402ms as PNG and 29ms raw — and an earlier
    // measurement that said PNG was cheap had been taken on a flat test image,
    // which is precisely the content deflate is good at.
    //
    // Both are lossless, so nothing about the picture changes; only the bytes
    // between one sharp call and the next.
    .raw()
    .toBuffer({ resolveWithObject: true })

  const upright = portrait
    ? await fromRaw(strip).rotate(-90).raw().toBuffer({ resolveWithObject: true })
    : strip

  const margin = SPROCKET_SHEET_MARGIN
  const sheet = ctx.format === 'original' ? null : canvasOf(ctx.format, ctx.scale, ctx.landscape)
  const canvasW = sheet ? sheet.w : Math.round(upright.info.width * (1 + margin * 2))
  const canvasH = sheet ? sheet.h : Math.round(upright.info.height * (1 + margin * 2))

  const fitted = await fromRaw(upright)
    .resize(Math.round(canvasW * (1 - margin * 2)), Math.round(canvasH * (1 - margin * 2)), { fit: 'inside' })
    .raw()
    .toBuffer({ resolveWithObject: true })

  return encode(canvasW, canvasH, palette.paper, [rawOverlay(
    fitted,
    Math.round((canvasW - fitted.info.width) / 2),
    Math.round((canvasH - fitted.info.height) / 2),
  )], quality)
}

/**
 * A mounted transparency, laid on the chosen sheet.
 *
 * The board itself is square because a 35mm mount is square — 50mm each way,
 * whatever shape the frame inside it happens to be. That is not a reason for
 * the exported file to be square, which is what it used to do: the format was
 * collapsed to `Math.min(w, h)` and the encode was `(canvas, canvas)`, so Post,
 * Square and Story returned byte-identical images while the dialog drew three
 * different aspect swatches above them. The mount is square; the sheet it sits
 * on is whatever was asked for.
 *
 * Everything is drawn the right way up. The board used to be built with the
 * frame turned on its side and rotated back at the end, the way the film strip
 * genuinely has to be — but the strip is long and the mount is square, so the
 * rotation changed nothing except to stand every printed word on its end. On a
 * portrait frame the stock name, the date stamp, the remark and the lab line
 * all read vertically.
 */
async function renderSlide(ctx: RenderContext, quality: number): Promise<Buffer> {
  const palette = THEMES[ctx.theme]

  const sheet = ctx.format === 'original' ? null : canvasOf(ctx.format, ctx.scale, ctx.landscape)
  const squareSheet = Math.round(Math.min(ORIGINAL_LONG_EDGE * ctx.scale, Math.max(ctx.srcW, ctx.srcH)))
  const canvasW = sheet ? sheet.w : squareSheet
  const canvasH = sheet ? sheet.h : squareSheet

  // The mount is sized by the shorter side of the sheet, so it fits whichever
  // way the sheet is turned.
  const board = Math.min(canvasW, canvasH)
  const outer = Math.round(board * 0.045)
  const mount = board - outer * 2
  const radius = Math.round(mount * 0.06)

  const printSize = Math.max(8, Math.round(mount * 0.032))
  const printGap = Math.round(mount * 0.012)
  const bezel = Math.round(mount * 0.02)
  const track = (size: number) => Math.max(1, Math.round(size * 0.14))
  const subSize = Math.max(7, Math.round(mount * 0.021))
  const stampSize = Math.max(7, Math.round(mount * 0.023))
  const pad = Math.round(mount * 0.06)
  const gap = Math.round(mount * 0.02)

  const stock = ctx.film.toUpperCase()
  // The stock's own description, not a guess. This read "COLOR SLIDE" for every
  // photograph, so an Ilford HP5 frame came back on a mount that called it
  // colour reversal. filmTypeLabel returns nothing when either axis is unknown,
  // and then the mount says only what it does know: the format.
  const kind = [ctx.filmFormat || '35mm', ctx.filmKind].filter(Boolean).join('  ').toUpperCase()
  const lab = `PROCESSED BY ${WORDMARK_TEXT}`

  const stamp = (() => {
    if (!ctx.date) return ''
    const parts = ctx.date.replace(',', '').split(' ')
    return parts.length >= 3 ? `${parts[0].toUpperCase()} ${parts[2]}` : ctx.date.toUpperCase()
  })()

  // Set in the mount's own face rather than a terminal mono, which read as a
  // console readout instead of something printed on card.
  const stampLine = stamp
    ? await createTextImage(stamp, stampSize, SLIDE.ink, { weight: 600, letterSpacing: track(stampSize) * 2 })
    : null
  const stampW = stampLine ? await widthOf(stampLine) : 0

  // The stock name shares its line with the date stamp, so it is measured
  // against what the stamp leaves rather than the full width. A long name —
  // "KODAK PROFESSIONAL PORTRA 400" — used to be centered across the whole
  // mount and printed straight through the stamp.
  const headWidth = Math.max(Math.round(mount * 0.3), mount - (stampW ? stampW + pad * 2 : 0) - pad * 2)

  const top1 = stock ? await renderCaptionLine(stock, printSize, SLIDE.print, 700, track(printSize), headWidth) : null
  const top2 = await renderCaptionLine(kind, subSize, SLIDE.print, 500, track(subSize) * 2, headWidth)
  const labLine = await renderCaptionLine(lab, subSize, SLIDE.print, 600, track(subSize) * 2, mount - pad * 2)

  const stockH = top1 ? Math.ceil(printSize * 1.4) : 0
  const subH = Math.ceil(subSize * 1.4)
  const printTop = Math.round(mount * 0.055)
  // Measured, and now actually used: the old code computed this and never read
  // it, then centered the window on the whole mount, so on any frame squarer
  // than about 7:6 the window covered the subtitle it sits under.
  const headerH = stockH + (top1 ? printGap : 0) + subH
  const headerBottom = printTop + headerH

  const remark = ctx.caption || ctx.camera
  const handSize = Math.max(10, Math.round(mount * 0.05))
  const written = remark
    ? await sharp(
        await renderCaptionLine(remark, handSize, SLIDE.pen, 400, 0, Math.round(mount * 0.72), 'hand')
      )
        .rotate((seeded(ctx.seed, 41) - 0.5) * 3.2, { background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .toBuffer()
    : null
  const writtenMeta = written ? await sharp(written).metadata() : null
  const writtenH = writtenMeta?.height ?? 0

  const labTop = mount - Math.round(mount * 0.055) - subH
  const remarkTop = written ? labTop - gap - writtenH : labTop

  // What is left between the printing above and the writing below is the window,
  // rather than the window being centered on the board and the printing taking
  // its chances.
  const wellTop = headerBottom + gap
  const wellHeight = Math.max(Math.round(mount * 0.2), remarkTop - gap - wellTop)

  const apertureW = Math.round(mount * 0.78)
  const apertureH = Math.max(1, wellHeight - bezel * 2)
  const fitted = await ctx.photo.resize(apertureW, apertureH, { fit: 'inside', withoutEnlargement: true }).toBuffer()
  const fm = await sharp(fitted).metadata()
  const photoW = fm.width || apertureW
  const photoH = fm.height || apertureH
  const frameW = photoW + bezel * 2
  const frameH = photoH + bezel * 2

  const center = (w: number) => Math.round((mount - w) / 2)
  const frameTop = wellTop + Math.round((wellHeight - frameH) / 2)

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

  if (top1) parts.push({ input: top1, left: center(await widthOf(top1)), top: printTop })
  parts.push({ input: top2, left: center(await widthOf(top2)), top: printTop + stockH + (top1 ? printGap : 0) })

  // The stamp goes in the top corner, on the line the head width was reserved
  // against.
  if (stampLine) parts.push({ input: stampLine, left: mount - pad - stampW, top: printTop })

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

  if (written) {
    parts.push({ input: written, left: center(await widthOf(written)), top: remarkTop })
  }

  parts.push({ input: labLine, left: center(await widthOf(labLine)), top: labTop })
  parts.push(...(await grainLayer(mount, mount)))
  // Last, always: every tiled overlay above covers the full square, corners
  // included, so the board has to be cut to shape after the final one.
  parts.push({ input: shape, blend: 'dest-in' })

  const mounted = await sharp({
    create: { width: mount, height: mount, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite(parts)
    .png()
    .toBuffer()

  return encode(canvasW, canvasH, palette.paper, [{
    input: mounted,
    left: Math.round((canvasW - mount) / 2),
    top: Math.round((canvasH - mount) / 2),
  }], quality)
}

export async function renderExport(params: RenderContext & { style: ExportStyle; quality: number }): Promise<Buffer> {
  const { style, quality, ...ctx } = params
  if (style === 'bare') return renderBare(ctx, quality)
  if (style === 'sprocket') return renderSprocket(ctx, quality, false)
  if (style === 'slide') return renderSlide(ctx, quality)
  if (style === 'negative') return renderSprocket(ctx, quality, true)
  return renderClean(ctx, quality)
}
