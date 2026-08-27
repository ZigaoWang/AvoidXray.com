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

export type ExportFormat = 'post' | 'square' | 'story' | 'original'
export type ExportStyle = 'bare' | 'clean' | 'strip' | 'slide' | 'negative' | 'xray'

function isExportStyle(value: string | null): value is ExportStyle {
  return value === 'bare' || value === 'clean' || value === 'strip'
    || value === 'slide' || value === 'negative' || value === 'xray'
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
const WORDMARK = {
  light: fs.readFileSync(path.join(process.cwd(), 'public', 'logo.svg'), 'utf-8'),
  dark: fs.readFileSync(path.join(process.cwd(), 'public', 'logo-inverted.svg'), 'utf-8'),
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
  const { width: canvasW, fixedHeight } = canvasBase(ctx.format, ctx.srcW, ctx.srcH, 0.055)
  const margin = Math.round(canvasW * 0.055)

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
  const metaSize = Math.round(canvasW * 0.0165)
  const lineGap = Math.round(canvasW * 0.011)
  const tracking = Math.max(1, Math.round(canvasW * 0.0018))

  const gear = [ctx.camera, ctx.film].filter(Boolean).join('   ·   ').toUpperCase()
  const byline = [ctx.username ? `@${ctx.username}` : '', ctx.date].filter(Boolean).join('   ·   ').toUpperCase()

  const lines: { text: string; size: number; color: string; weight: number; track: number }[] = []
  if (ctx.caption) lines.push({ text: ctx.caption, size: titleSize, color: palette.ink, weight: 700, track: 0 })
  if (gear) lines.push({ text: gear, size: metaSize, color: palette.ink, weight: 600, track: tracking })
  if (byline) lines.push({ text: byline, size: metaSize, color: palette.muted, weight: 500, track: tracking })

  const lineHeights = lines.map(l => Math.ceil(l.size * 1.4))
  const textHeight = lineHeights.reduce((a, b) => a + b, 0) + lineGap * Math.max(0, lines.length - 1)

  const logoHeight = Math.round(canvasW * 0.032)
  const logoGap = lines.length ? Math.round(canvasW * 0.026) : 0
  const logo = await sharp(Buffer.from(palette.mark === 'dark' ? WORDMARK.dark : WORDMARK.light))
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

/** A length of 35mm laid on paper, perforations punched through the black. */
async function renderStrip(ctx: RenderContext, quality: number): Promise<Buffer> {
  const palette = THEMES[ctx.theme]
  const { width: canvasW, fixedHeight } = canvasBase(ctx.format, ctx.srcW, ctx.srcH, 0.05)
  const margin = Math.round(canvasW * 0.05)
  const perforation = Math.round(canvasW * 0.042)
  const frameGap = Math.round(canvasW * 0.018)
  const gap = Math.round(canvasW * 0.045)

  const metaSize = Math.round(canvasW * 0.0165)
  const lineGap = Math.round(canvasW * 0.011)
  const tracking = Math.max(1, Math.round(canvasW * 0.0018))

  const gear = [ctx.camera, ctx.film].filter(Boolean).join('   ·   ').toUpperCase()
  const byline = [ctx.username ? `@${ctx.username}` : '', ctx.date].filter(Boolean).join('   ·   ').toUpperCase()
  const lines: { text: string; color: string; weight: number }[] = []
  if (gear) lines.push({ text: gear, color: palette.ink, weight: 600 })
  if (byline) lines.push({ text: byline, color: palette.muted, weight: 500 })

  const lineH = Math.ceil(metaSize * 1.4)
  const textHeight = lines.length ? lines.length * lineH + lineGap * (lines.length - 1) : 0

  const logoHeight = Math.round(canvasW * 0.030)
  const logo = await sharp(Buffer.from(palette.mark === 'dark' ? WORDMARK.dark : WORDMARK.light))
    .resize({ height: logoHeight }).png().toBuffer()
  const logoW = await widthOf(logo)
  const logoGap = Math.round(canvasW * 0.024)
  const blockHeight = textHeight + (textHeight ? logoGap : 0) + logoHeight

  // A portrait frame means the strip is running vertically, so the perforated
  // edges are the sides. The band hugs the frame rather than spanning the paper.
  const vertical = ctx.srcH > ctx.srcW
  const chromeX = vertical ? (perforation + frameGap) * 2 : frameGap * 2
  const chromeY = vertical ? frameGap * 2 : (perforation + frameGap) * 2

  const maxFrameW = canvasW - margin * 2 - chromeX
  const maxFrameH = fixedHeight !== null
    ? fixedHeight - margin * 2 - gap - blockHeight - chromeY
    : Math.round((ctx.srcH / ctx.srcW) * maxFrameW)

  const fitted = await ctx.photo.resize(maxFrameW, maxFrameH, { fit: 'inside' }).toBuffer()
  const fm = await sharp(fitted).metadata()
  const photoW = fm.width || maxFrameW
  const photoH = fm.height || maxFrameH

  const bandW = photoW + chromeX
  const bandH = photoH + chromeY
  const canvasH = fixedHeight ?? margin * 2 + bandH + gap + blockHeight
  const bandTop = margin + (fixedHeight !== null
    ? Math.round((fixedHeight - margin * 2 - gap - blockHeight - bandH) / 2)
    : 0)

  const centre = (w: number) => Math.round((canvasW - w) / 2)
  const bandLeft = centre(bandW)
  const composites: OverlayOptions[] = [
    { input: filmBand(bandW, bandH, perforation, vertical), left: bandLeft, top: bandTop },
    {
      input: fitted,
      left: bandLeft + (vertical ? perforation + frameGap : frameGap),
      top: bandTop + (vertical ? frameGap : perforation + frameGap),
    },
  ]

  let cursorY = bandTop + bandH + gap
  for (const line of lines) {
    const buffer = await renderCaptionLine(line.text, metaSize, line.color, line.weight, tracking, bandW)
    composites.push({ input: buffer, left: centre(await widthOf(buffer)), top: cursorY })
    cursorY += lineH + lineGap
  }
  if (textHeight) cursorY += logoGap - lineGap
  composites.push({ input: logo, left: centre(logoW), top: cursorY })
  composites.push(await grainLayer())

  return encode(canvasW, canvasH, palette.paper, composites, quality)
}

/** A mounted transparency, printing and all. */
async function renderSlide(ctx: RenderContext, quality: number): Promise<Buffer> {
  const { width: canvasW, fixedHeight } = canvasBase(ctx.format, ctx.srcW, ctx.srcH, 0.22)
  const outer = Math.round(canvasW * 0.028)
  const pad = Math.round(canvasW * 0.055)
  const printSize = Math.round(canvasW * 0.040)
  const printGap = Math.round(canvasW * 0.008)
  const tracking = Math.max(1, Math.round(canvasW * 0.002))
  const bezel = Math.round(canvasW * 0.014)

  // Our own printing rather than Kodak's legend: whatever the caption says,
  // over the mark. Leave the caption empty and the film stock takes the line.
  const headline = (ctx.caption || ctx.film || 'FILM').toUpperCase()
  const top1 = await renderCaptionLine(headline, printSize, SLIDE.print, 700, tracking * 2, canvasW - (outer + pad) * 2)
  const top2 = await createTextImage('AVOIDXRAY', printSize, SLIDE.print, { weight: 500, letterSpacing: tracking * 4 })
  const printH = Math.ceil(printSize * 1.4) * 2 + printGap

  const metaSize = Math.round(canvasW * 0.019)
  const meta = [ctx.camera, ctx.film].filter(Boolean).join('  ·  ').toUpperCase()
  const metaImage = meta
    ? await renderCaptionLine(meta, metaSize, SLIDE.ink, 600, tracking, canvasW - (outer + pad) * 2)
    : null
  const metaH = metaImage ? Math.ceil(metaSize * 1.4) + Math.round(canvasW * 0.018) : 0

  const windowW = canvasW - (outer + pad) * 2
  const windowH = fixedHeight !== null
    ? fixedHeight - (outer + pad) * 2 - printH * 2 - metaH
    : Math.round((ctx.srcH / ctx.srcW) * windowW)

  const fitted = await ctx.photo.resize(windowW - bezel * 2, windowH - bezel * 2, { fit: 'inside' }).toBuffer()
  const fm = await sharp(fitted).metadata()
  const photoW = fm.width || windowW
  const photoH = fm.height || windowH

  const frameW = photoW + bezel * 2
  const frameH = photoH + bezel * 2
  const canvasH = fixedHeight ?? (outer + pad) * 2 + printH * 2 + metaH + frameH

  const centre = (w: number) => Math.round((canvasW - w) / 2)
  const mountW = canvasW - outer * 2
  const mountH = canvasH - outer * 2
  const radius = Math.round(canvasW * 0.035)

  const composites: OverlayOptions[] = [{
    input: Buffer.from(
      `<svg width="${mountW}" height="${mountH}" xmlns="http://www.w3.org/2000/svg">` +
      `<rect width="${mountW}" height="${mountH}" rx="${radius}" fill="${SLIDE.mount}"/></svg>`
    ),
    left: outer,
    top: outer,
  }]

  const printTop = outer + pad
  composites.push({ input: top1, left: centre(await widthOf(top1)), top: printTop })
  composites.push({ input: top2, left: centre(await widthOf(top2)), top: printTop + Math.ceil(printSize * 1.4) + printGap })

  const frameTop = printTop + printH + Math.round((canvasH - (outer + pad) * 2 - printH * 2 - metaH - frameH) / 2)
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
      top: frameTop + frameH + Math.round(canvasW * 0.018),
    })
  }

  // The lab prints the same legend upside down on the reverse face.
  const flip1 = await sharp(top1).rotate(180).toBuffer()
  const flip2 = await sharp(top2).rotate(180).toBuffer()
  const printBottom = canvasH - outer - pad - printH
  composites.push({ input: flip2, left: centre(await widthOf(flip2)), top: printBottom })
  composites.push({ input: flip1, left: centre(await widthOf(flip1)), top: printBottom + Math.ceil(printSize * 1.4) + printGap })
  composites.push(await grainLayer())

  return encode(canvasW, canvasH, THEMES[ctx.theme].paper, composites, quality)
}

/** Orange mask and edge printing: the frame as it comes off the roll. */
const NEGATIVE = { base: '#0B0B0B', edge: '#F07A2A', mask: '#FF9A4D' } as const

/** The scanner's console, which is the thing this site is named after. */
const XRAY = { base: '#04100F', glow: '#5FE6D0', warn: '#FF4B3E', grid: '#123A38' } as const

async function renderNegative(ctx: RenderContext, quality: number): Promise<Buffer> {
  const palette = THEMES[ctx.theme]
  const { width: canvasW, fixedHeight } = canvasBase(ctx.format, ctx.srcW, ctx.srcH, 0.05)
  const margin = Math.round(canvasW * 0.05)
  const perforation = Math.round(canvasW * 0.042)
  const edgeSize = Math.round(canvasW * 0.016)
  const edgeBand = Math.ceil(edgeSize * 1.4) + Math.round(canvasW * 0.008)
  const gap = Math.round(canvasW * 0.045)

  const logoHeight = Math.round(canvasW * 0.030)
  const logo = await sharp(Buffer.from(palette.mark === 'dark' ? WORDMARK.dark : WORDMARK.light))
    .resize({ height: logoHeight }).png().toBuffer()
  const logoW = await widthOf(logo)

  const vertical = ctx.srcH > ctx.srcW
  const chromeX = vertical ? (perforation + edgeBand) * 2 : Math.round(canvasW * 0.018) * 2
  const chromeY = vertical ? Math.round(canvasW * 0.018) * 2 : (perforation + edgeBand) * 2

  const maxFrameW = canvasW - margin * 2 - chromeX
  const maxFrameH = fixedHeight !== null
    ? fixedHeight - margin * 2 - gap - logoHeight - chromeY
    : Math.round((ctx.srcH / ctx.srcW) * maxFrameW)

  // Inverted, then pushed through the orange mask a real negative carries.
  const inverted = await ctx.photo
    .resize(maxFrameW, maxFrameH, { fit: 'inside' })
    .negate({ alpha: false })
    .modulate({ saturation: 0.75 })
    .toBuffer()
  const im = await sharp(inverted).metadata()
  const photoW = im.width || maxFrameW
  const photoH = im.height || maxFrameH

  const masked = await sharp(inverted)
    .composite([{
      input: { create: { width: photoW, height: photoH, channels: 3, background: hexToRgb(NEGATIVE.mask) } },
      blend: 'multiply',
    }])
    .modulate({ brightness: 1.35 })
    .toBuffer()

  const bandW = photoW + chromeX
  const bandH = photoH + chromeY
  const canvasH = fixedHeight ?? margin * 2 + bandH + gap + logoHeight
  const bandTop = margin + (fixedHeight !== null
    ? Math.round((fixedHeight - margin * 2 - gap - logoHeight - bandH) / 2)
    : 0)

  const centre = (w: number) => Math.round((canvasW - w) / 2)
  const bandLeft = centre(bandW)

  // Edge printing runs along the length of the film, so it turns with it.
  const code = [ctx.film || 'FILM', ctx.date].filter(Boolean).join('   ').toUpperCase()
  const edgeFlat = await createTextImage(`${code}   \u25b8   ${(ctx.camera || 'AVOIDXRAY').toUpperCase()}`,
    edgeSize, NEGATIVE.edge, { weight: 700, letterSpacing: 2, fontStyle: 'mono' })
  const edge = vertical ? await sharp(edgeFlat).rotate(90).toBuffer() : edgeFlat
  const edgeMeta = await sharp(edge).metadata()

  const composites: OverlayOptions[] = [
    { input: filmBand(bandW, bandH, perforation, vertical), left: bandLeft, top: bandTop },
    {
      input: masked,
      left: bandLeft + (vertical ? perforation + edgeBand : Math.round(canvasW * 0.018)),
      top: bandTop + (vertical ? Math.round(canvasW * 0.018) : perforation + edgeBand),
    },
    vertical
      ? {
          input: edge,
          left: bandLeft + perforation + Math.round(edgeBand * 0.15),
          top: bandTop + Math.round((bandH - (edgeMeta.height || 0)) / 2),
        }
      : {
          input: edge,
          left: bandLeft + Math.round(bandW * 0.03),
          top: bandTop + perforation + Math.round(edgeBand * 0.15),
        },
    { input: logo, left: centre(logoW), top: bandTop + bandH + gap },
    await grainLayer(),
  ]

  return encode(canvasW, canvasH, palette.paper, composites, quality)
}

async function renderXray(ctx: RenderContext, quality: number): Promise<Buffer> {
  const { width: canvasW, fixedHeight } = canvasBase(ctx.format, ctx.srcW, ctx.srcH, 0.05)
  const margin = Math.round(canvasW * 0.055)
  const gap = Math.round(canvasW * 0.04)
  const readSize = Math.round(canvasW * 0.017)
  const lineGap = Math.round(canvasW * 0.012)
  const lineH = Math.ceil(readSize * 1.4)

  const rows = [
    `FILM    ${(ctx.film || 'UNKNOWN').toUpperCase()}`,
    `CAMERA  ${(ctx.camera || 'UNKNOWN').toUpperCase()}`,
    `OPER    ${(ctx.username ? '@' + ctx.username : 'AVOIDXRAY').toUpperCase()}${ctx.date ? '    ' + ctx.date.toUpperCase() : ''}`,
  ]
  const readoutH = rows.length * lineH + lineGap * (rows.length - 1)

  const logoHeight = Math.round(canvasW * 0.030)
  const logo = await sharp(Buffer.from(WORDMARK.dark)).resize({ height: logoHeight }).png().toBuffer()
  const logoW = await widthOf(logo)

  const frameW = canvasW - margin * 2
  const frameH = fixedHeight !== null
    ? fixedHeight - margin * 2 - gap * 2 - readoutH - logoHeight
    : Math.round((ctx.srcH / ctx.srcW) * frameW)

  // Density read as brightness, the way a scanner shows it, then tinted to the
  // phosphor green every security monitor has used since the eighties.
  const scanned = await ctx.photo
    .resize(frameW, frameH, { fit: 'inside' })
    .grayscale()
    .negate({ alpha: false })
    .linear(1.2, -18)
    .tint(hexToRgb(XRAY.glow))
    .toBuffer()
  const sm = await sharp(scanned).metadata()
  const photoW = sm.width || frameW
  const photoH = sm.height || frameH

  const canvasH = fixedHeight ?? margin * 2 + photoH + gap * 2 + readoutH + logoHeight
  const photoLeft = Math.round((canvasW - photoW) / 2)
  const photoTop = margin + (fixedHeight !== null ? Math.round((frameH - photoH) / 2) : 0)

  // Raster lines, so it reads as a scan rather than a filter.
  const step = Math.max(3, Math.round(canvasW * 0.004))
  const scanLines = Array.from({ length: Math.floor(photoH / step) }, (_, i) =>
    `<rect x="0" y="${i * step}" width="${photoW}" height="1" fill="#000000" opacity="0.28"/>`
  ).join('')
  const bracket = Math.round(canvasW * 0.05)
  const stroke = Math.max(2, Math.round(canvasW * 0.003))
  const corners = `
    <path d="M0 ${bracket} V0 H${bracket}" fill="none" stroke="${XRAY.glow}" stroke-width="${stroke}"/>
    <path d="M${photoW - bracket} 0 H${photoW} V${bracket}" fill="none" stroke="${XRAY.glow}" stroke-width="${stroke}"/>
    <path d="M${photoW} ${photoH - bracket} V${photoH} H${photoW - bracket}" fill="none" stroke="${XRAY.glow}" stroke-width="${stroke}"/>
    <path d="M${bracket} ${photoH} H0 V${photoH - bracket}" fill="none" stroke="${XRAY.glow}" stroke-width="${stroke}"/>`

  const overlay = Buffer.from(
    `<svg width="${photoW}" height="${photoH}" xmlns="http://www.w3.org/2000/svg">${scanLines}${corners}</svg>`
  )

  const warning = await createTextImage('DO NOT X-RAY', Math.round(canvasW * 0.030), XRAY.warn, { weight: 700, letterSpacing: 3, fontStyle: 'mono' })
  const warningW = await widthOf(warning)
  const stamped = await sharp(warning).rotate(-7, { background: { r: 0, g: 0, b: 0, alpha: 0 } }).toBuffer()

  const composites: OverlayOptions[] = [
    { input: scanned, left: photoLeft, top: photoTop },
    { input: overlay, left: photoLeft, top: photoTop },
    {
      input: stamped,
      left: photoLeft + Math.max(0, photoW - warningW - Math.round(canvasW * 0.06)),
      top: photoTop + photoH - Math.round(canvasW * 0.11),
    },
  ]

  let cursorY = photoTop + photoH + gap
  for (const row of rows) {
    const line = await renderCaptionLine(row, readSize, XRAY.glow, 600, 2, frameW, 'mono')
    composites.push({ input: line, left: margin, top: cursorY })
    cursorY += lineH + lineGap
  }

  composites.push({ input: logo, left: canvasW - margin - logoW, top: canvasH - margin - logoHeight })
  composites.push(await grainLayer())

  return encode(canvasW, canvasH, XRAY.base, composites, quality)
}

async function renderExport(params: RenderContext & { style: ExportStyle; quality: number }): Promise<Buffer> {
  const { style, quality, ...ctx } = params
  if (style === 'bare') return renderBare(ctx, quality)
  if (style === 'strip') return renderStrip(ctx, quality)
  if (style === 'slide') return renderSlide(ctx, quality)
  if (style === 'negative') return renderNegative(ctx, quality)
  if (style === 'xray') return renderXray(ctx, quality)
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
