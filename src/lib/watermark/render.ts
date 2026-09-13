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
  PRINT_DPI,
  canvasOf,
  type ExportFormat,
  type ExportStyle,
  type ExportTheme,
  PAPER_COLOR,
  PRINT_INSET,
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

/**
 * The two cuts of the wordmark.
 *
 * They differ in one thing: whether the "X RAY" half sits in a white box or a
 * black one. The red half is the same in both, and both stay legible on either
 * paper — on white, the standard cut's white box disappears and the lettering
 * reads plainly, while the inverted cut puts it in a solid black block. On
 * black the two swap round.
 *
 * So this is a weight choice rather than a legibility one, which is why it is
 * offered rather than decided: the plain cut is quieter under a photograph, and
 * the boxed one is firmer. It used to be picked from the paper, which always
 * gave the heavier of the two on a white print.
 */
const WORDMARK = {
  standard: fs.readFileSync(path.join(process.cwd(), 'public', 'logo.svg'), 'utf-8'),
  inverted: fs.readFileSync(path.join(process.cwd(), 'public', 'logo-inverted.svg'), 'utf-8'),
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

  // Letter spacing included: without it a tracked line was estimated narrower
  // than it draws, and sharp refuses a composite larger than its base — so the
  // fallback path could turn a font failure into a different 500.
  const estimatedWidth = width || Math.ceil([...text].length * (fontSize * 0.7 + letterSpacing))
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
  light: { paper: PAPER_COLOR.light, ink: '#111111', muted: '#8A8A8A', hairline: '#E4E4E4' },
  dark: { paper: PAPER_COLOR.dark, ink: '#FFFFFF', muted: '#8A8A8A', hairline: '#242424' },
} as const

/** 35mm cardboard mount, as the lab returns a mounted transparency. */
const SLIDE = {
  /** Pale card, the way a cardboard mount comes back from a lab. */
  mount: '#E8E4DB',
  print: '#2A2823',
  window: '#0B0B0B',
  ink: '#2A2823',
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
  const buffer = await tile
  if (canvasW >= tileSize && canvasH >= tileSize) {
    return [{ input: buffer, tile: true, blend }]
  }
  // Shrunk to fit rather than dropped.
  //
  // sharp refuses a composite larger than its base, so this returned nothing at
  // all — and a look that quietly loses its grain or its pressed board stops
  // being the object it claims to be. The contact sheet is where it showed: an
  // instant card for a panoramic frame is 596x304 against a 320px card texture,
  // so the one tile standing for that object had no texture on it while the
  // file it stands for does.
  const side = Math.max(1, Math.min(tileSize, canvasW, canvasH))
  return [{ input: await sharp(buffer).resize(side, side).png().toBuffer(), tile: true, blend }]
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

/**
 * A QR symbol drawn at a whole number of pixels per module.
 *
 * It was sized as a fraction of the sheet — 6.2% — which at the smallest export
 * is 67px for a 41-module symbol including its quiet zone: 1.63 pixels per
 * module, and not a whole number, so every module boundary fell inside a pixel
 * and the edges were averaged away. It decodes from the pristine file and fails
 * from a phone pointed at a print, which is the only thing a QR on a photograph
 * is for.
 *
 * Three pixels per module is the floor that survives a camera; the symbol takes
 * whatever size that comes to and the layout measures it rather than dictating
 * it.
 */
async function qrSymbol(url: string, target: number, exportScale: number): Promise<{ image: Buffer; size: number }> {
  const modules = QRCode.create(url).modules.size + 4
  // Chosen at the base size and multiplied by the export's scale, so the symbol
  // keeps one fraction of the sheet at every resolution. Rounding the target
  // directly gave 3, 4 and 5 pixels per module across the three steps — a QR
  // that was a tenth of the width in the preview and a seventeenth in the file,
  // which is a different composition rather than the same one larger, and made
  // the reported height wrong for every canvas the block feeds.
  const base = Math.max(3, Math.round(target / exportScale / modules))
  const scale = base * exportScale
  const image = await QRCode.toBuffer(url, {
    scale,
    margin: 2,
    color: { dark: '#000000', light: '#FFFFFF' },
  })
  return { image, size: modules * scale }
}

/**
 * The largest size at which a line fits the room it is given.
 *
 * renderCaptionLine shortens a line that will not fit, which is right for a
 * caption somebody typed and wrong for anything that came out of the catalog: a
 * truncated stock name is a fact the export got wrong, not a decoration it
 * dropped. "Kodak UltraMax 400" came back as "Kodak UltraMax 4…", a mount read
 * "LOMOGRAPHY LOMOCHROME COLOR '92 SU…", and a credit line ended at "@r…".
 *
 * Solved rather than stepped down. The width a line is fitted against is its
 * measured run plus size * 0.2 of slack, and the tracking scales with the size
 * too, so the whole width is linear in it and the answer is one division.
 */
function sizeToFit(
  text: string,
  wanted: number,
  weight: number,
  room: number,
  options: {
    fontStyle?: 'sans' | 'mono' | 'hand'
    /** Letter spacing at a given size, where the caller uses any. */
    track?: (size: number) => number
    min?: number
  } = {},
): number {
  const { fontFamily, fontWeight } = faceFor(weight, options.fontStyle ?? 'sans')
  const spacing = options.track?.(wanted) ?? 0
  let run: number
  try {
    run = measureRun(text, wanted, fontFamily, fontWeight, spacing)
  } catch {
    // The same estimate renderCaptionLine falls back to when Cairo is missing a
    // face, rather than a throw from a helper that only decides a font size.
    run = [...text].length * (wanted * 0.7 + spacing)
  }
  if (run <= 0) return wanted
  return Math.max(options.min ?? 8, Math.min(wanted, Math.floor(room / (run / wanted + 0.2))))
}

/** One caption line, shortened only if it would overrun the frame. */
async function renderCaptionLine(
  text: string, size: number, color: string, weight: number, letterSpacing: number,
  maxWidth: number, fontStyle?: 'sans' | 'mono' | 'hand'
): Promise<Buffer> {
  const { fontFamily, fontWeight } = faceFor(weight, fontStyle ?? 'sans')
  const drawnWidth = (value: string) => {
    try {
      return Math.ceil(measureRun(value, size, fontFamily, fontWeight, letterSpacing) + size * 0.2)
    } catch {
      // measureRun is the only call here that reaches Cairo, and it sat outside
      // the guard createTextImage puts around the same library — so a font
      // failure that every other call site degrades through became a 500 for
      // any line that needed fitting. The estimate is the one the SVG fallback
      // uses, with the letter spacing it forgets.
      return Math.ceil([...value].length * (size * 0.7 + letterSpacing))
    }
  }

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
  /** The heavier cut of the wordmark, with "X RAY" in a solid block. */
  invertMark: boolean
  /** Written for a lab: tagged with its physical size, and full chroma. */
  print: boolean
  /**
   * Whether a filmstrip is laid on a sheet or is the whole file.
   *
   * Only the two film looks read it. A length of film is a thing in its own
   * right, and the paper around it is a way of presenting it rather than part
   * of what it is.
   */
  border?: boolean
  /** Crop the photograph to fill its frame rather than fitting it inside. */
  fill: boolean
  theme: ExportTheme
  caption: string
  camera: string
  film: string
  username: string
  date: string
  qrUrl: string | null
}

/**
 * The border of paper around the photograph.
 *
 * Proportional to the sheet's long edge, which is what makes it read as a
 * margin: on a panoramic frame the short edge is a third of the long one, so
 * measuring from it gave a 25px border under a 284px caption block — a hairline
 * at the top and sides against a broad foot, which is not a mat, it is a
 * mistake.
 *
 * Capped at a share of the short edge, because that is the side it has to fit
 * inside twice. Without the cap a turned Story sheet at the widest setting came
 * to 1920x1080 with a 576px margin and a frame 72 pixels shorter than nothing,
 * which sharp refuses outright. The cap only ever binds at the wide end of the
 * mat control, where the picture is meant to be small anyway.
 */
const MAT_MAX_SHARE = 0.35

function matMargin(w: number, h: number, matRatio: number): number {
  return Math.min(
    Math.round(Math.max(w, h) * matRatio),
    Math.round(Math.min(w, h) * MAT_MAX_SHARE),
  )
}

/** Canvas width, and the fixed height when the format dictates one. */
function canvasBase(format: ExportFormat, srcW: number, srcH: number, matRatio: number, scale: number, landscape: boolean) {
  if (format !== 'original') {
    const { w, h } = canvasOf(format, scale, landscape)
    return { width: w, margin: matMargin(w, h, matRatio), fixedHeight: h as number | null }
  }
  // The margin is returned rather than left to be worked out again.
  //
  // It was budgeted here against the photograph's long edge and then recomputed
  // by each caller against the finished canvas width — two different numbers
  // for one margin, so the frame the canvas had been sized to hold was not the
  // frame that got drawn. On an upright photograph the canvas is sized by the
  // height and the margin taken from the width, which left the frame several
  // percent larger than the picture budgeted for it.
  const fit = Math.min(1, (ORIGINAL_LONG_EDGE * scale) / Math.max(srcW, srcH))
  const w = Math.round(srcW * fit)
  const h = Math.round(srcH * fit)
  const margin = matMargin(w, h, matRatio)
  return { width: w + margin * 2, margin, fixedHeight: null }
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
async function encode(
  canvasW: number, canvasH: number, paper: string,
  composites: OverlayOptions[], quality: number,
  /**
   * The density to tag, when the file is going to a lab. Zero for a screen.
   *
   * A number rather than a flag: the density is now whatever the photograph can
   * actually hold on the paper asked for, so a constant here would have written
   * 300 on a sheet rendered at 600 and told the lab to lay it out at twice its
   * real size.
   */
  print: number | boolean,
) {
  const sheet = sharp({ create: { width: canvasW, height: canvasH, channels: 3, background: hexToRgb(paper) } })
    .composite(composites)

  if (!print) return sheet.jpeg({ quality }).toBuffer()

  return sheet
    // The physical size, without which a lab has nothing to go on. A JPEG
    // carrying no density is read at 72dpi, so a 1800px file that is a 6-inch
    // print asks to be laid out at 25 inches and comes back flagged as low
    // resolution — or worse, printed that way.
    .withDensity(typeof print === 'number' ? print : PRINT_DPI)
    // Full chroma. sharp subsamples at every quality, which halves the color
    // resolution in both axes — and this renderer's signature content is
    // exactly what that ruins: thin orange edge printing, fine red lettering on
    // a slide mount, the orange cast of a negative. It costs about 40% more
    // bytes on a file that is going to paper once.
    .jpeg({ quality, chromaSubsampling: '4:4:4' })
    .toBuffer()
}

/** Nothing but the photograph and an even mat. */
async function renderBare(ctx: RenderContext, quality: number): Promise<Buffer> {
  const palette = THEMES[ctx.theme]
  // The control sets the size of the photograph, so the mat is what gives way:
  // all the way up is edge to edge, all the way down is a wide gallery mat.
  const ratio = 0.30 - (ctx.mat / 100) * 0.295
  const { width: canvasW, margin, fixedHeight } = canvasBase(ctx.format, ctx.srcW, ctx.srcH, ratio, ctx.scale, ctx.landscape)

  const frameW = canvasW - margin * 2
  const frameH = fixedHeight !== null ? fixedHeight - margin * 2 : Math.round((ctx.srcH / ctx.srcW) * frameW)

  const fitted = await ctx.photo.resize(frameW, frameH, ctx.fill
    // Filling crops to the frame's shape, so it cannot also decline to enlarge:
    // covering both sides is the whole instruction. availableResolutions asks a
    // stricter question when fill is on, so a size that would enlarge is never
    // offered in the first place.
    ? { fit: 'cover', position: 'center' }
    : { fit: 'inside', withoutEnlargement: true }
  ).toBuffer()
  const m = await sharp(fitted).metadata()
  const photoW = m.width || frameW
  const photoH = m.height || frameH
  const canvasH = fixedHeight ?? photoH + margin * 2

  return encode(canvasW, canvasH, palette.paper, [{
    input: fitted,
    left: Math.round((canvasW - photoW) / 2),
    top: Math.round((canvasH - photoH) / 2),
  }, ...(await grainLayer(canvasW, canvasH))], quality, ctx.print)
}

/**
 * Roughly how tall the "as shot" sheet will come out, before the type is sized.
 *
 * Only used to decide which side of the sheet is shorter, so it need not be
 * exact: the block under the photograph is a fraction of the total, and sizing
 * it from the width for this one estimate cannot change which side wins except
 * on a sheet that is already very nearly square.
 */
function estimateOwnSheetHeight(ctx: RenderContext, canvasW: number, margin: number): number {
  const photoH = Math.round((ctx.srcH / ctx.srcW) * (canvasW - margin * 2))
  const lineCount =
    (ctx.caption ? 1 : 0) +
    (ctx.camera || ctx.film ? 1 : 0) +
    (ctx.username || ctx.date ? 1 : 0)
  const metaSize = Math.round(canvasW * 0.027)
  const text = lineCount
    ? lineCount * Math.ceil(metaSize * 1.4) + Math.round(canvasW * 0.012) * (lineCount - 1)
    : 0
  const mark = Math.round(canvasW * 0.026) + (lineCount ? Math.round(canvasW * 0.026) : 0)
  return margin * 2 + photoH + Math.round(canvasW * 0.036) + text + mark
}

/** Gallery print: photograph, centered caption, wordmark. */
async function renderClean(ctx: RenderContext, quality: number): Promise<Buffer> {
  const palette = THEMES[ctx.theme]
  const { width: canvasW, margin, fixedHeight } = canvasBase(ctx.format, ctx.srcW, ctx.srcH, 0.043, ctx.scale, ctx.landscape)

  /**
   * The side the type is proportional to: the shorter one.
   *
   * It was the width, which only reads as "a fraction of the sheet" while every
   * sheet is upright. Once a canvas can be turned, the same photograph printed
   * landscape got type half again as large as printed portrait — and a panorama
   * got the worst of it, a 49px caption under a picture 585px tall, because its
   * width says nothing about how much room there is.
   *
   * Unchanged for every upright canvas, which is what these proportions were
   * chosen against.
   */
  const sheetSide = fixedHeight !== null
    ? Math.min(canvasW, fixedHeight)
    // The "as shot" sheet's height is not known until the block under the
    // photograph has been measured, and that block is what is being sized. One
    // estimate settles it: the type is a small part of the total, so a second
    // pass would move it by a pixel at most.
    : Math.min(canvasW, estimateOwnSheetHeight(ctx, canvasW, margin))

  // Sized to be read, and ordered so the photograph's own facts come first.
  //
  // These were set small, in the way a gallery label is small — but a gallery
  // label is read from a foot away and this is read on a phone, where the
  // camera and the stock came out at 1.9% of the sheet and the photographer's
  // name at 1.7%. Raised by about 40%.
  //
  // The mark comes down at the same time. At 0.032 it was larger than the
  // caption and half again the size of the credit, so the most prominent thing
  // under somebody's photograph was the name of the site it was exported from.
  const gap = Math.round(sheetSide * 0.036)
  const titleSize = Math.round(sheetSide * 0.038)
  const metaSize = Math.round(sheetSide * 0.027)
  const lineGap = Math.round(sheetSide * 0.012)

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

  const logoHeight = Math.round(sheetSide * 0.026)
  const logoGap = lines.length ? Math.round(sheetSide * 0.026) : 0
  const logo = await sharp(Buffer.from(ctx.invertMark ? WORDMARK.inverted : WORDMARK.standard))
    .resize({ height: logoHeight }).png().toBuffer()
  const logoW = await widthOf(logo)

  // Built before the layout, because a QR's size is decided by its modules and
  // not by a fraction of the sheet.
  const qr = ctx.qrUrl ? await qrSymbol(ctx.qrUrl, Math.round(sheetSide * 0.062), ctx.scale) : null
  const qrSize = qr ? qr.size : 0
  const qrGap = ctx.qrUrl ? Math.round(sheetSide * 0.022) : 0
  const markRowH = Math.max(logoHeight, qrSize)
  const markRowW = logoW + (ctx.qrUrl ? qrGap + qrSize : 0)

  const blockHeight = textHeight + logoGap + markRowH
  const frameW = canvasW - margin * 2
  const frameH = fixedHeight !== null
    ? fixedHeight - margin * 2 - gap - blockHeight
    : Math.round((ctx.srcH / ctx.srcW) * frameW)

  const fitted = await ctx.photo.resize(frameW, frameH, ctx.fill
    // Filling crops to the frame's shape, so it cannot also decline to enlarge:
    // covering both sides is the whole instruction. availableResolutions asks a
    // stricter question when fill is on, so a size that would enlarge is never
    // offered in the first place.
    ? { fit: 'cover', position: 'center' }
    : { fit: 'inside', withoutEnlargement: true }
  ).toBuffer()
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

  if (qr) {
    composites.push({ input: qr.image, left: markLeft + logoW + qrGap, top: cursorY + Math.round((markRowH - qrSize) / 2) })
  }
  composites.push(...(await grainLayer(canvasW, canvasH)))

  return encode(canvasW, canvasH, palette.paper, composites, quality, ctx.print)
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
  // The backlight's own color, which is white. This was a warm off-white,
  // which is what a hole looks like over paper and not what one looks like on
  // a light table — and beside a white sheet it read as a yellow cast.
  hole: '#FFFFFF',
  holeEdge: '#DADADA',
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
 * Matched on the brand string the catalog already stores. Anything unrecognized
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

/** A guard bar and six bits of speed, which is what the code actually says. */
const DX_BARS = 7

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
function dxBars(seed: string, unit: number, barH: number, rowGap: number, stock: Stock, ink: string): { image: Buffer; width: number } {
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

  // Seven bars: the guard and the six speed bits. It used to run for whatever
  // length it was handed, so only the first seven meant anything and the rest
  // was filler stretched across the rebate — and the length it was handed was a
  // floor rather than a fit, so on a square-ish frame with a long handle the
  // code, the frame number and the handle all overprinted each other.
  const bars: string[] = []
  let x = 0
  for (let i = 0; i < DX_BARS; i++) {
    const w = unit * (wide(i) ? 2 : 1)
    bars.push(`<rect x="${x}" y="0" width="${w}" height="${barH}" fill="${ink}"/>`)
    bars.push(`<rect x="${x}" y="${barH + rowGap}" width="${w}" height="${barH}" fill="${ink}"/>`)
    x += w + unit
  }
  const width = Math.max(1, Math.round(x - unit))
  const height = barH * 2 + rowGap
  return {
    image: Buffer.from(
      `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">${bars.join('')}</svg>`
    ),
    width,
  }
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
  // The floor holds the smallest full-size export exactly where it has always
  // been, and must not hold a thumbnail there with it. Asked for a third of the
  // canvas, this still built a 1500px strip — 3.3 megapixels for a frame that
  // ends up in a 400px cell on the contact sheet, twice, once for the strip and
  // once for the negative.
  // Rounded, and this is not cosmetic: the width becomes a canvas dimension at
  // the create() below, and sharp refuses a fractional one outright. The scale
  // is a whole number only for a preview — a print derives it from the paper
  // and "full" derives it from the scan, so 1500 * 4.9725 is 7458.75 and the
  // whole download came back a 500 while the preview beside it, pinned to
  // scale 1, drew a perfect strip.
  //
  // The cap is outermost, so it is a cap. Taking a floor of 1500 over the top
  // of it enlarged every frame whose short edge is under 1029px — the nine
  // panoramas here cap at 1277 and were being stretched to 1500 by a fit:'fill'
  // that cannot decline. The floor itself turned out to say nothing: at any
  // scale of 1 or more, 1500 * scale is already 1500 or more, and below 1 the
  // floor was that same expression.
  const cap = Math.round(Math.min(srcW, srcH) / F.imageHeight)
  const width = Math.max(1, Math.min(cap, Math.round(1500 * scale)))
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
 * The largest the photograph itself will be drawn, which is not the sheet.
 *
 * The route has to decide whether to pull an original across the Pacific or use
 * the 1600px medium, and asking the canvas table gets that wrong in the common
 * case: the Frame sheet is 1620 tall and the Story sheet 1920, both over the
 * medium, while the photograph inside a Frame print is fitted into about
 * 988x1340 — every side under 1600, so the original contributes nothing at all
 * and costs eight megabytes to contribute it. Frame is the default size for a
 * 3:2 scan, so this was most of the library's downloads.
 *
 * Deliberately generous: the text block under a Clean print is ignored, and the
 * mat is taken at its narrowest. Erring toward the original costs bytes; erring
 * the other way would enlarge a scan.
 */
export function drawnLongEdge(
  style: ExportStyle,
  format: ExportFormat,
  scale: number,
  landscape: boolean,
  mat: number,
  srcW: number,
  srcH: number,
): number {
  if (style === 'sprocket' || style === 'negative') {
    return Math.max(sprocketStrip(scale, srcW, srcH).length, sprocketStrip(scale, srcW, srcH).width)
  }

  const sheet = format === 'original'
    ? { w: ORIGINAL_LONG_EDGE * scale, h: ORIGINAL_LONG_EDGE * scale }
    : canvasOf(format, scale, landscape)
  const short = Math.min(sheet.w, sheet.h)

  if (style === 'instant') {
    // The card draws the photograph at its own long edge, not at 91% of the
    // sheet as the formula below assumes, and then covers it — which always
    // enlarges. Falling through understated it, so a frame between 1600 and
    // 1750px was handed the 1600px medium and had it stretched.
    const card = instantCard(scale, srcW, srcH)
    return Math.max(card.picW, card.picH)
  }

  if (style === 'slide') {
    // The mount is square on the sheet's short side, and the window is 78% of it.
    return Math.round(short * (1 - 0.045 * 2) * 0.78)
  }

  // Bare's mat narrows to almost nothing at the top of its range; Clean's is
  // fixed. Both leave the photograph the sheet less twice that margin.
  const ratio = style === 'bare' ? 0.30 - (mat / 100) * 0.295 : 0.043
  const margin = Math.round(short * ratio)
  return Math.max(1, Math.max(sheet.w, sheet.h) - margin * 2)
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
  // through it, so it is bright whatever color paper the strip is laid on.
  // Painting it the paper color only looked right by coincidence on white:
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
    // Pulling the chroma down models a color negative's muted dye inversion.
    // On a monochrome stock there is nothing to pull, so it is removed outright
    // instead, which keeps the base honest rather than faintly tinted.
    pipeline = ctx.stock.monochrome
      ? pipeline.modulate({ saturation: 0 })
      : pipeline.modulate({ saturation: 0.7 })
  }
  const exposure = await pipeline.raw().toBuffer({ resolveWithObject: true })
  // The orange mask belongs to a color negative and to nothing else. It is the
  // dye layer's own cast, and a black-and-white stock does not have one — a
  // Tri-X negative is a neutral gray base. Every inverted export wore the
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
  // The speed goes with the film. Switching "Show film" off resolves ctx.film
  // to empty but left the ISO behind, so the rebate read "AVOIDXRAY  400" —
  // a number with nothing to belong to, from the stock the viewer had just
  // asked not to name.
  const speed = ctx.film && ctx.stock.iso && ctx.stock.iso > 0 && !carriesSpeed(ctx.film, ctx.stock.iso)
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
  const dx = dxBars(ctx.seed, unit, barH, rowGap, ctx.stock, ink)
  // Budgeted rather than assumed. The three things along the bottom rebate --
  // the frame number, the code and the handle -- have one run between them, and
  // when they do not fit the code is what gives way: it is the one a reader
  // cannot miss the absence of.
  const rebateRun = stripLen - inset * 2 - pad * 2
  const dxFits = bottomNumberW + dx.width + handleW <= rebateRun
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
      ...(dxFits ? [{ input: dx.image, left: inset + bottomNumberW + pad, top: dxY }] : []),
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

  // The strip can be the whole file. A length of film is a thing in its own
  // right, and a border around it is a way of presenting it rather than part of
  // what it is — so it is offered rather than assumed.
  const margin = ctx.border === false ? 0 : SPROCKET_SHEET_MARGIN
  const sheet = ctx.format === 'original' ? null : canvasOf(ctx.format, ctx.scale, ctx.landscape)
  const canvasW = sheet ? sheet.w : Math.round(upright.info.width * (1 + margin * 2))
  const canvasH = sheet ? sheet.h : Math.round(upright.info.height * (1 + margin * 2))

  const fitted = margin === 0 && !sheet
    ? upright
    : await fromRaw(upright)
        .resize(Math.round(canvasW * (1 - margin * 2)), Math.round(canvasH * (1 - margin * 2)), { fit: 'inside' })
        .raw()
        .toBuffer({ resolveWithObject: true })

  return encode(canvasW, canvasH, palette.paper, [rawOverlay(
    fitted,
    Math.round((canvasW - fitted.info.width) / 2),
    Math.round((canvasH - fitted.info.height) / 2),
  )], quality, ctx.print)
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
/**
 * Type as ink on card, rather than as vector on a flat field.
 *
 * A glyph composited straight from Cairo has a mathematically exact edge and a
 * perfectly even body, and at any size where you can read it that is the one
 * thing that says "drawn" rather than "printed". Card is absorbent: the edge of
 * a letter spreads a fraction into the fibers and the body varies where the
 * fibers took more ink or less.
 *
 * Both of those, cheaply. The layer is softened, which spreads the edge, and
 * then the alpha is pulled back up so the middle of a stroke reads as solid
 * rather than out of focus — soft edge, dense body, which is what absorption
 * does. A little deterministic mottle on top, seeded so a preview and the file
 * it stands for are the same picture.
 */
async function inked(layer: Buffer, sigma: number, seed: string): Promise<Buffer> {
  const { data, info } = await sharp(layer)
    .ensureAlpha()
    .blur(Math.max(0.3, sigma))
    .raw()
    .toBuffer({ resolveWithObject: true })

  // One hash per pixel rather than a random number: the same export has to come
  // out the same twice, and the preview beside the button is a second render of
  // the same thing.
  let hash = 2166136261
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }

  for (let i = 3; i < data.length; i += 4) {
    if (data[i] === 0) continue
    hash ^= i
    hash = Math.imul(hash, 16777619)
    const mottle = 1 + (((hash >>> 8) % 1000) / 1000 - 0.5) * 0.34
    // Just past one. A larger restore dilates the stroke instead of holding it:
    // at 1.55 the softened edge was pushed back out past where it started and
    // the whole line came back heavier than the vector it replaced, which is
    // the opposite of the point. Small letterpress on card is lighter than its
    // outline, not bolder, so this holds the body and lets the card take the
    // last of it.
    data[i] = Math.max(0, Math.min(255, Math.round(data[i] * 1.14 * mottle * 0.94)))
  }

  return sharp(data, { raw: info }).png().toBuffer()
}

async function renderSlide(ctx: RenderContext, quality: number): Promise<Buffer> {
  const palette = THEMES[ctx.theme]

  // The mount is the file. A 35mm mount is square, so the file is square, and
  // it is not laid on a sheet of some other shape first: doing that put a board
  // in the middle of a taller or wider ground and called the empty part of it
  // the export.
  const board = Math.round(Math.min(ORIGINAL_LONG_EDGE * ctx.scale, Math.max(ctx.srcW, ctx.srcH)))
  const canvasW = board
  const canvasH = board
  /**
   * The ground the mount lies on, and whether there is any.
   *
   * With a border the mount is an object photographed on a surface, and its
   * die-cut corner is a corner: there is paper behind it to see it against.
   * Without one the mount is the file, and a rounded corner would have nothing
   * behind it but the sheet it is supposed to have replaced — four notches of
   * stray paper at the edges of the picture. So the corner squares off with the
   * border, because edge to edge there is no corner to cut.
   */
  const outer = ctx.border === false ? 0 : Math.round(board * 0.045)
  const mount = board - outer * 2
  const radius = outer === 0 ? 0 : Math.round(mount * 0.018)

  /**
   * Two lines of printing, at the edges, small.
   *
   * This had four blocks of tracked-out capitals stacked down the middle of the
   * card — the stock, the format, the date and the lab — with the window left
   * whatever room they did not take. Nothing is laid out that way except a
   * poster, and a mount is not a poster: what is printed on one is small,
   * functional and pushed to the edges, because the middle of a mount is a hole.
   *
   * So: one line along the top and one along the foot, each carrying something
   * at the left and something at the right, and the window given everything in
   * between.
   */
  const pad = Math.round(mount * 0.055)
  const lineSize = Math.max(8, Math.round(mount * 0.027))
  const lineH = Math.ceil(lineSize * 1.35)
  // Tight. The old tracking was 0.14 of the size and then doubled again on
  // three of the four lines, which is what made a stock name read as a banner.
  const track = (size: number) => Math.max(1, Math.round(size * 0.05))
  const bezel = Math.round(mount * 0.018)
  const gap = Math.round(mount * 0.03)

  // Printed in ink, not in the maker's brand color.
  //
  // This took the film's rebate ink, so a Fuji frame came back with the whole
  // mount set in green on pale board. A rebate is exposed onto the film by the
  // maker; a mount is printed on card by the lab, and every mount that has ever
  // come back from one is black on white.
  const print = SLIDE.print
  const stock = ctx.film.toUpperCase()
  // The stock's own description, not a guess. This read "COLOR SLIDE" for every
  // photograph, so an Ilford HP5 frame came back on a mount that called it
  // color reversal. filmTypeLabel returns nothing when either axis is unknown,
  // and then the mount says only what it does know: the format.
  // The camera, not the gauge.
  //
  // This printed the format and the emulsion type, and neither is something the
  // catalog reliably knows: the gauge fell back to a literal '35mm' whenever the
  // stock's column was empty, so a 120 frame was labelled 35mm on the strength
  // of a default, and filmTypeLabel needs both chromaticity and polarity to say
  // anything at all. A mount that states the wrong gauge is worse than a mount
  // that states nothing. The camera is on 1067 of the library's 1076
  // photographs and is a fact rather than an inference.
  const gear = ctx.camera.toUpperCase()

  // The whole date. It printed the month and the year and dropped the day,
  // which is the one part of it that says which frame this was.
  const stamp = ctx.date.toUpperCase()

  /** A line set at the mount's own small size, fitted to the room it has. */
  const rule = async (text: string, room: number, weight: number) => {
    if (!text) return null
    const size = sizeToFit(text, lineSize, weight, room, { track })
    // Crisp, deliberately.
    //
    // These were given a softened edge and a mottled body to read as ink laid
    // into card rather than as vector on a field. At the size a mount is
    // actually looked at that is a good model; at the size one is downloaded it
    // is just out of focus, which is worse than looking drawn. The handwritten
    // note keeps the treatment, because a pen stroke on board genuinely is
    // uneven and it is set large enough to carry it.
    return renderCaptionLine(text, size, print, weight, track(size), room)
  }

  const half = Math.round((mount - pad * 2 - gap) / 2)
  const stampLine = await rule(stamp, half, 600)
  const stampW = stampLine ? await widthOf(stampLine) : 0
  // The stock takes whatever the date leaves it, rather than being centered
  // across the whole card and printed straight through it.
  const stockLine = await rule(stock, mount - pad * 2 - (stampW ? stampW + gap : 0), 700)

  const markLine = await rule(WORDMARK_TEXT, half, 600)
  const markW = markLine ? await widthOf(markLine) : 0

  const gearLine = await rule(gear, mount - pad * 2 - (markW ? markW + gap : 0), 500)

  const topY = pad
  const botY = mount - pad - lineH

  // The caption, and only the caption. This fell back to the camera name, so
  // "Show caption" and "Show camera" read as two independent toggles and were
  // not. A remark written on a mount is a remark, not a gear list.
  const remark = ctx.caption

  /**
   * The band a written note sits in, reserved whether or not there is one.
   *
   * The window used to give up its own height to make room, so writing on a
   * mount moved the photograph up the card and taking the note away moved it
   * back down. A mount is a die-cut piece of board: the hole is where the hole
   * is, and what somebody writes underneath it does not move it.
   */
  const noteBand = Math.round(mount * 0.075)

  const handSize = remark
    ? sizeToFit(remark, Math.round(noteBand * 0.66), 400, Math.round(mount * 0.62), { fontStyle: 'hand' })
    : 0
  const written = remark
    ? await inked(
        // Off level, because a short note written by hand on a small card is.
        // Seeded, so the preview and the file are the same picture.
        await sharp(
          await renderCaptionLine(remark, handSize, SLIDE.pen, 400, 0, Math.round(mount * 0.62), 'hand')
        )
          .rotate((seeded(ctx.seed, 41) - 0.5) * 2.8, { background: { r: 0, g: 0, b: 0, alpha: 0 } })
          .toBuffer(),
        // Lighter than the printing: a pen lays ink on the surface rather than
        // soaking it into the fibers the way a press does.
        handSize * 0.03,
        `${ctx.seed}:note`,
      )
    : null
  const writtenH = written ? ((await sharp(written).metadata()).height ?? 0) : 0

  // Everything between the top line and the note band is the window.
  const wellTop = topY + lineH + gap
  const wellBottom = botY - gap - noteBand
  const wellHeight = Math.max(Math.round(mount * 0.2), wellBottom - wellTop)

  // A little inside the type's own margin, so the board reads as board. The
  // aperture on a real 2-inch mount is about 62% of the card, which is right in
  // the hand and reads as a picture stranded in a field of it on a screen; this
  // is the compromise, not the measurement.
  const apertureW = mount - Math.round(mount * 0.078) * 2
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

  // The top line: the stock at the left, the process date at the right.
  if (stockLine) parts.push({ input: stockLine, left: pad, top: topY })
  if (stampLine) parts.push({ input: stampLine, left: mount - pad - stampW, top: topY })

  // The window, cut through card that has thickness: a lip catching the light
  // along the top and left, a shadow falling along the bottom and right. It was
  // a flat black rectangle on a flat field, which is why the mount read as
  // printed rather than made.
  const cut = Math.max(1, Math.round(mount * 0.005))
  parts.push({
    input: Buffer.from(
      `<svg width="${frameW + cut * 2}" height="${frameH + cut * 2}" xmlns="http://www.w3.org/2000/svg">` +
      `<rect width="${frameW + cut * 2}" height="${frameH + cut * 2}" fill="rgba(0,0,0,0.22)"/>` +
      `<rect width="${frameW + cut}" height="${frameH + cut}" fill="rgba(255,255,255,0.32)"/>` +
      `<rect x="${cut}" y="${cut}" width="${frameW}" height="${frameH}" fill="${SLIDE.window}"/>` +
      `</svg>`
    ),
    left: center(frameW) - cut,
    top: frameTop - cut,
  })
  parts.push({ input: fitted, left: center(photoW), top: frameTop + bezel })

  if (written) {
    parts.push({
      input: written,
      left: center(await widthOf(written)),
      // Centered in the band that was reserved for it, rather than stacked up
      // from the foot line.
      top: wellBottom + Math.round((noteBand - writtenH) / 2),
    })
  }

  // The foot: the camera at the left, the mark at the right.

  if (gearLine) parts.push({ input: gearLine, left: pad, top: botY })
  if (markLine) parts.push({ input: markLine, left: mount - pad - markW, top: botY })

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
  }], quality, ctx.print)
}


/** Instant film: a wide chin under the picture, with the date written on it. */
const INSTANT = {
  /** Not quite white. Instant stock is warm and slightly gray. */
  card: '#F4F2ED',
  /** A dark, slightly blue marker, as a felt tip dries on coated card. */
  pen: '#1C1C22',
  ink: '#8B8880',
  /** The picture sits in a shallow well, not flush with the card. */
  well: '#100F0E',
} as const

/**
 * An instant print: the photograph near the top of a card with a wide chin
 * below it, and the date written across the chin by hand.
 *
 * The chin is the whole point. Every other look here puts its type in a
 * measured block and centers it; this one has a person's handwriting on it, at
 * a size that reads across a room, sitting slightly off level because nothing
 * written by hand is level. The small line underneath is the only typeset thing
 * on the card.
 *
 * The proportions are an integral print's, not a rectangle with a caption:
 * the picture is close to square, the border is thin on three sides and deep at
 * the foot, and the whole card is a little taller than it is wide.
 */
async function renderInstant(ctx: RenderContext, quality: number): Promise<Buffer> {
  const palette = THEMES[ctx.theme]

  /**
   * The card is cut around the photograph, not the photograph fitted into a card.
   *
   * It was the other way round: a sheet was chosen first, the card filled the
   * sheet, and the picture went into whatever the borders left over. So a 3:2
   * frame on a square sheet sat in the middle of the card with a band of empty
   * cream above and below it, and "as shot" gave every card a fixed 1.2 tilt
   * that had nothing to do with the frame inside it. An instant print is
   * assembled the other way: the picture is the size it is, and the card is cut
   * around it, and the card is the whole file. Laying it on a sheet only put a
   * cream card on a white ground with a band of one nearly-white between two
   * others, which reads as a mistake rather than as an object on a surface.
   *
   * The proportions are an integral print's, measured off the real thing: a
   * 79mm picture in an 88 x 107mm card, so the border is 0.057 of the picture
   * and the chin 0.297 of it. Against the picture's width, which is what the
   * writing across the chin has to span — but never more than a share of its
   * height, which is the part a square reference frame cannot tell you.
   *
   * An integral print's picture is square, so on the real thing the width and
   * the height are the same number and there is nothing to choose between
   * them. A panoramic frame is 2.74:1, and taking the chin off its width alone
   * gave an XPan card a chin four fifths as tall as the photograph above it.
   */
  const { picW, picH, border, chinHeight, cardW, cardH } = instantCard(ctx.scale, ctx.srcW, ctx.srcH)

  const canvasW = cardW
  const canvasH = cardH

  // Cropped rather than fitted: the card already has the photograph's own
  // proportions, so this only takes up the rounding on the two sides. There is
  // no letterbox left for a fit to leave, which is why this look does not read
  // ctx.fill — there is no shape here to fill.
  const fitted = await ctx.photo
    .resize(picW, picH, { fit: 'cover', position: 'center' })
    .toBuffer()
  const photoW = picW
  const photoH = picH
  const wellW = picW
  const wellH = picH

  const parts: OverlayOptions[] = []

  // The card itself, warm and slightly gray rather than paper white.
  parts.push({
    input: Buffer.from(
      `<svg width="${cardW}" height="${cardH}" xmlns="http://www.w3.org/2000/svg">` +
      `<rect width="${cardW}" height="${cardH}" fill="${INSTANT.card}"/></svg>`
    ),
    left: 0,
    top: 0,
  })
  parts.push(...(await tiledLayer(CARD_TEXTURE, CARD_TEXTURE_SIZE, cardW, cardH)))

  // A shallow dark well behind the picture, so the emulsion sits in the card
  // rather than on it.
  const wellLeft = border + Math.round((wellW - photoW) / 2)
  const wellTop = border + Math.round((wellH - photoH) / 2)
  const lip = Math.max(1, Math.round(cardW * 0.004))
  parts.push({
    input: Buffer.from(
      `<svg width="${photoW + lip * 2}" height="${photoH + lip * 2}" xmlns="http://www.w3.org/2000/svg">` +
      `<rect width="${photoW + lip * 2}" height="${photoH + lip * 2}" fill="${INSTANT.well}"/></svg>`
    ),
    left: wellLeft - lip,
    top: wellTop - lip,
  })
  parts.push({ input: fitted, left: wellLeft, top: wellTop })

  const chinTop = border + wellH

  /**
   * What gets written on the chin.
   *
   * A short date, the way somebody labels a print they have just pulled: the
   * month and the day, not the year, which they already know. The caption wins
   * when there is one, because a person writing on a print writes what it was
   * rather than when.
   */
  const written = (() => {
    if (ctx.caption) return ctx.caption
    if (ctx.date) {
      // The year, written the way a year is written on a print.
      //
      // This dropped it and wrote "Aug 23", on the reasoning that somebody
      // labelling a print they have just pulled already knows the year. They
      // do; a stranger scrolling past does not, and "Aug 23" reads as 2023
      // about as readily as it reads as the twenty-third.
      const parts = ctx.date.replace(',', '').split(' ')
      if (parts.length < 3) return ctx.date
      const [month, day, year] = parts
      return `${month} ${day} '${year.slice(-2)}`
    }
    // Failing both, the emulsion.
    //
    // Measured over the library: 206 of 1076 photographs carry a caption and
    // 251 a date, so on 738 of them — better than two thirds — the chin had
    // nothing written on it and this look came out as a blank cream band under
    // the picture. A film stock is on 1067 of the 1076, and the stock is what
    // somebody writes on a print they have just pulled anyway.
    return ctx.film || ''
  })()

  if (written) {
    // Sized to the line rather than to the chin. A short date can be set large
    // enough to read across a room, which is the point of it; "Kodak UltraMax
    // 400" at that size ran off the card and came back cut mid-word.
    // A note, not a headline. At 0.46 of the chin across 0.82 of the card a
    // stock name was set in marker as wide as the picture and became the
    // loudest thing in the file, which is not what writing on a print looks
    // like.
    const handRoom = Math.round(cardW * 0.60)
    const handSize = sizeToFit(written, Math.round(chinHeight * 0.26), 400, handRoom, {
      fontStyle: 'hand', min: 10,
    })
    const line = await renderCaptionLine(
      written, handSize, INSTANT.pen, 400, 0, handRoom, 'hand'
    )
    // Level.
    //
    // It used to be rotated a degree or two, seeded off the photograph, on the
    // reasoning that nothing written by hand is level. That reasoning holds for
    // a short word on a square print and falls apart on a line the width of a
    // panoramic card: the same angle that reads as a human hand across two
    // inches reads as a misaligned layer across eight, and the rotation also
    // resampled the type, which is why it looked softer than the line beneath
    // it.
    const tilted = line
    const tm = await sharp(tilted).metadata()
    // Centered in the upper part of the chin, so a line the fitting above had to
    // set small still sits where a hand would have put it rather than clinging
    // to the top edge.
    parts.push({
      input: tilted,
      left: Math.round((cardW - (tm.width || 0)) / 2),
      top: chinTop + Math.max(0, Math.round((chinHeight * 0.64 - (tm.height || handSize)) / 2)),
    })
  }

  // The typeset line, small and quiet, under the handwriting. The stock is left
  // out of it when the chin already has it written across in pen.
  const facts = [ctx.camera, written === ctx.film ? '' : ctx.film].filter(Boolean).join('  ·  ')
  const who = [ctx.username ? `@${ctx.username}` : '', written ? '' : ctx.date].filter(Boolean).join('  ·  ')
  const footer = [facts, who].filter(Boolean).join('  ·  ')

  if (footer) {
    // Fitted, not truncated. Off the card's width rather than the chin's depth,
    // and then solved down until it fits, the way the handwriting above is:
    // "Hasselblad XPan · InovisCoat OptiColour 200 · @rikki" is a real line
    // from the catalog and it came back as "@r…", which loses the credit
    // rather than a decoration.
    const footRoom = Math.round(cardW * 0.86)
    // The card's own face, not a terminal's. JetBrains Mono is right on a
    // filmstrip's rebate, which is machine-printed on the film itself, and
    // wrong under a handwritten note on a paper card — it read as a console
    // readout stapled to a photograph.
    const footSize = sizeToFit(footer, Math.max(9, Math.round(cardW * 0.021)), 500, footRoom, {
      track: size => Math.max(1, Math.round(size * 0.05)),
    })
    const foot = await renderCaptionLine(
      footer, footSize, INSTANT.ink, 500, Math.max(1, Math.round(footSize * 0.05)),
      footRoom, 'sans'
    )
    // A border's width clear of the bottom edge, which is the same margin the
    // picture has down the sides. Measured against the chin instead, the line
    // sat where a deep chin put it and crowded the edge on a shallow one — a
    // panoramic card's chin is capped, so its credit was half the clearance of
    // an ordinary frame's.
    const fm = await sharp(foot).metadata()
    parts.push({
      input: foot,
      left: Math.round((cardW - (fm.width || 0)) / 2),
      top: chinTop + chinHeight - border - (fm.height || 0),
    })
  }

  parts.push(...(await grainLayer(cardW, cardH)))

  const card = await sharp({
    create: { width: cardW, height: cardH, channels: 3, background: hexToRgb(INSTANT.card) },
  })
    .composite(parts)
    .png()
    .toBuffer()

  return encode(
    canvasW,
    canvasH,
    palette.paper,
    [{ input: card, left: Math.round((canvasW - cardW) / 2), top: Math.round((canvasH - cardH) / 2) }],
    quality,
    ctx.print,
  )
}

/**
 * Lay a finished export on a sheet of paper.
 *
 * Every look can be printed, and only two of them are ever the paper's shape.
 * A mount is square, a card is the frame plus a chin, a strip is the frame plus
 * its rebate — so asking any of them to *be* a 4x6 means either cropping the
 * object or stretching it, and both are wrong. What a lab actually returns when
 * you send it a mounted transparency is the mount, centered, with paper around
 * it, and that is this.
 *
 * The sheet is filled with the look's own paper rather than white, so a
 * Darkroom print or a Negative comes back on its own ground instead of stranded
 * on a white border it never asked for.
 */
async function layOnPaper(
  object: Buffer, sheet: { w: number; h: number; dpi: number }, paper: string, quality: number,
): Promise<Buffer> {
  // A hair inside the sheet, so the object is a print on paper rather than
  // something that runs off the edge of it. Labs trim, and a border this size
  // survives being trimmed.
  const inset = Math.round(Math.min(sheet.w, sheet.h) * PRINT_INSET)
  const fitted = await sharp(object)
    .resize(Math.max(1, sheet.w - inset * 2), Math.max(1, sheet.h - inset * 2), { fit: 'inside' })
    .toBuffer()
  const m = await sharp(fitted).metadata()

  return encode(
    sheet.w,
    sheet.h,
    paper,
    [{
      input: fitted,
      left: Math.round((sheet.w - (m.width || 0)) / 2),
      top: Math.round((sheet.h - (m.height || 0)) / 2),
    }],
    quality,
    sheet.dpi,
  )
}

/**
 * An instant card's geometry, asked rather than guessed at.
 *
 * Exported because the route has to know how large a render will be before it
 * starts one — the semaphore goes exclusive past a threshold, and it was
 * estimating from the photograph rather than from the canvas, which understated
 * this card by two thirds and a panoramic filmstrip by five times. sprocketStrip
 * exists for the same reason; this is that pattern applied to the other object.
 *
 * The proportions are an integral print's, measured off the real thing: a 79mm
 * picture in an 88 x 107mm card, so the border is 0.057 of the picture and the
 * chin 0.297 of it. Against the picture's width, which is what the writing has
 * to span, but never more than a share of its height — an integral print is
 * square, so the real thing cannot tell you which of the two to use, and taking
 * the chin off the width alone gave a 2.74:1 panorama a chin four fifths as
 * tall as the photograph above it.
 */
export function instantCard(scale: number, srcW: number, srcH: number) {
  const BORDER = 0.057
  const CHIN = 0.297
  const BORDER_OF_HEIGHT = 0.09
  const CHIN_OF_HEIGHT = 0.40

  const aspect = srcW / srcH
  const picW = Math.round(
    Math.min(ORIGINAL_LONG_EDGE * scale, Math.max(srcW, srcH)) * Math.min(1, aspect)
  )
  const picH = Math.max(1, Math.round(picW / aspect))
  const border = Math.max(1, Math.round(Math.min(picW * BORDER, picH * BORDER_OF_HEIGHT)))
  const chinHeight = Math.max(1, Math.round(Math.min(picW * CHIN, picH * CHIN_OF_HEIGHT)))
  return { picW, picH, border, chinHeight, cardW: picW + border * 2, cardH: picH + border + chinHeight }
}

/** A slide mount's board, which is square because a 35mm mount is. */
export function slideBoard(scale: number, srcW: number, srcH: number): number {
  return Math.round(Math.min(ORIGINAL_LONG_EDGE * scale, Math.max(srcW, srcH)))
}

/**
 * Roughly how many megapixels a look will actually composite.
 *
 * The route needs this before it renders, to decide whether a job takes one
 * render slot or both. It was asking how large the *photograph* would be drawn,
 * which is not the question: every look puts something around the picture, and
 * measured against real renders the canvas runs from 1.4 times the picture's
 * area for a gallery print to 5.4 times for a panoramic filmstrip. Two of those
 * were being admitted as light and composited side by side on a 2GB box.
 *
 * Exact where the geometry is already a function — the strip, the mount, the
 * card — and a measured bound for the two sheet looks, whose height depends on
 * a block of type. Over-stating costs a render an exclusive slot it did not
 * need; under-stating costs the machine.
 */
export function canvasMegapixels(
  style: ExportStyle,
  format: ExportFormat,
  scale: number,
  landscape: boolean,
  srcW: number,
  srcH: number,
  bordered = true,
): number {
  if (style === 'sprocket' || style === 'negative') {
    const strip = sprocketStrip(scale, srcW, srcH).upright
    const grown = bordered ? 1 + SPROCKET_SHEET_MARGIN * 2 : 1
    return (strip.w * grown * strip.h * grown) / 1e6
  }
  if (style === 'slide') {
    const board = slideBoard(scale, srcW, srcH)
    return (board * board) / 1e6
  }
  if (style === 'instant') {
    const card = instantCard(scale, srcW, srcH)
    return (card.cardW * card.cardH) / 1e6
  }

  // The two that are a sheet with a picture on it. The sheet is the picture
  // plus a mat plus, for Clean, a block of type whose height depends on how
  // many lines the catalog gives it — so this is bounded rather than derived.
  // Measured over 3:2, 2:3, 1:1 and 2.74:1 sources: Clean reaches 1.68 times
  // the picture's area and Bare 2.13.
  const SHEET_BOUND = 2.2
  if (format !== 'original') {
    const { w, h } = canvasOf(format, scale, landscape)
    return (w * h) / 1e6
  }
  const fit = Math.min(1, (ORIGINAL_LONG_EDGE * scale) / Math.max(srcW, srcH))
  return (srcW * fit * srcH * fit * SHEET_BOUND) / 1e6
}

export async function renderExport(
  params: RenderContext & {
    style: ExportStyle
    quality: number
    /** The sheet this is going on, in pixels, when it is going to a lab. */
    sheet?: { w: number; h: number; dpi: number } | null
  },
): Promise<Buffer> {
  const { style, quality, sheet, ...ctx } = params

  const draw = (at: number) => {
    if (style === 'bare') return renderBare(ctx, at)
    if (style === 'sprocket') return renderSprocket(ctx, at, false)
    if (style === 'slide') return renderSlide(ctx, at)
    if (style === 'instant') return renderInstant(ctx, at)
    if (style === 'negative') return renderSprocket(ctx, at, true)
    return renderClean(ctx, at)
  }

  if (!sheet) return draw(quality)
  // The object is encoded twice on the way to paper, so the first pass is set
  // as near lossless as a JPEG goes. At the asked-for quality the print path
  // would carry two generations of the same artefacts, on the one output where
  // they are least recoverable.
  return layOnPaper(await draw(100), sheet, THEMES[ctx.theme].paper, quality)
}
