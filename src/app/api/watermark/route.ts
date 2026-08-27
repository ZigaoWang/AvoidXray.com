import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
// sharp 0.35 dropped the `sharp.X` type namespace in favour of named type
// exports; the runtime default export is unchanged.
import sharp, { type OverlayOptions } from 'sharp'
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

// Load square favicon logo
// The wordmark at its natural 150x117, not the favicon. The favicon is padded
// to a square because browsers paint tab icons into a square box, and this is
// scaled by height — so using it would shrink the logo on every watermark.
const FAVICON_SVG = fs.readFileSync(path.join(process.cwd(), 'public', 'logo-mark.svg'), 'utf-8')

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
  light: { paper: '#FFFFFF', ink: '#111111', muted: '#767676', hairline: '#E4E4E4' },
  dark: { paper: '#0A0A0A', ink: '#FFFFFF', muted: '#8A8A8A', hairline: '#242424' },
} as const

function hexToRgb(hex: string) {
  return {
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16),
  }
}

/**
 * Renders the framed photograph.
 *
 * Every size is a fraction of the canvas height rather than a pixel constant.
 * The old renderer multiplied fixed pixel sizes by a scale clamped at 2.5, so a
 * 6140px scan got 75px type — about one percent of the frame, and unreadable.
 */
/** One caption line, shortened until it clears the mark on the right. */
async function renderCaptionLine(
  text: string, size: number, color: string, weight: number, letterSpacing: number, maxWidth: number
): Promise<Buffer> {
  let current = text
  for (let attempt = 0; attempt < 5; attempt++) {
    const buffer = await createTextImage(current, size, color, { weight, letterSpacing })
    const width = (await sharp(buffer).metadata()).width || 0
    if (width <= maxWidth || current.length <= 4) return buffer
    const keep = Math.max(3, Math.floor(current.length * (maxWidth / width)) - 1)
    current = `${text.slice(0, keep).trimEnd()}…`
  }
  return createTextImage(current, size, color, { weight, letterSpacing })
}

async function renderPrint(params: {
  source: Buffer
  format: ExportFormat
  theme: keyof typeof THEMES
  caption: string
  camera: string
  film: string
  username: string
  date: string
  qrUrl: string | null
  quality: number
}): Promise<Buffer> {
  const { source, format, theme, caption, camera, film, username, date, qrUrl, quality } = params
  const palette = THEMES[theme]

  const photo = sharp(source, SHARP_INPUT).rotate()
  const meta = await photo.metadata()
  const srcW = meta.width || 1000
  const srcH = meta.height || 1000

  // The canvas width is settled first, because every type size is a fraction
  // of it. The old renderer multiplied fixed pixel sizes by a scale clamped at
  // 2.5, so a 6140px scan got 75px type — about one percent of the frame.
  let canvasW: number
  let fixedHeight: number | null = null
  let originalPhoto: { w: number; h: number } | null = null

  if (format === 'original') {
    const scale = Math.min(1, ORIGINAL_LONG_EDGE / Math.max(srcW, srcH))
    originalPhoto = { w: Math.round(srcW * scale), h: Math.round(srcH * scale) }
    canvasW = originalPhoto.w + Math.round(Math.max(originalPhoto.w, originalPhoto.h) * 0.045) * 2
  } else {
    canvasW = CANVAS[format].w
    fixedHeight = CANVAS[format].h
  }

  // Thin mat, so the photograph is as large as the frame allows.
  const margin = Math.round(canvasW * 0.043)
  const gap = Math.round(canvasW * 0.036)

  const titleSize = Math.round(canvasW * 0.028)
  const metaSize = Math.round(canvasW * 0.0165)
  const lineGap = Math.round(canvasW * 0.011)
  const tracking = Math.max(1, Math.round(canvasW * 0.0018))

  const gear = [camera, film].filter(Boolean).join('   ·   ').toUpperCase()
  const byline = [username ? `@${username}` : '', date].filter(Boolean).join('   ·   ').toUpperCase()

  // Centred, and no more than three short lines. Left-aligned metadata with the
  // mark pushed to the far right left the whole lower third of the frame empty
  // on one side and crowded on the other.
  const lines: { text: string; size: number; color: string; weight: number; track: number }[] = []
  if (caption) lines.push({ text: caption, size: titleSize, color: palette.ink, weight: 700, track: 0 })
  if (gear) lines.push({ text: gear, size: metaSize, color: palette.ink, weight: 600, track: tracking })
  if (byline) lines.push({ text: byline, size: metaSize, color: palette.muted, weight: 500, track: tracking })

  // Known without rendering: createTextImage draws one line at size * 1.4.
  const lineHeights = lines.map(l => Math.ceil(l.size * 1.4))
  const textHeight = lineHeights.reduce((a, b) => a + b, 0) + lineGap * Math.max(0, lines.length - 1)

  // The mark sits centred beneath the caption, the way a printer's mark does.
  const logoHeight = Math.round(canvasW * 0.026)
  const logoGap = Math.round(canvasW * 0.024)
  const logo = await sharp(Buffer.from(FAVICON_SVG)).resize({ height: logoHeight }).png().toBuffer()
  const logoW = (await sharp(logo).metadata()).width || logoHeight

  const qrSize = qrUrl ? Math.round(canvasW * 0.055) : 0
  const qrGap = qrUrl ? Math.round(canvasW * 0.02) : 0

  const blockHeight = textHeight + logoGap + logoHeight + (qrUrl ? qrGap + qrSize : 0)

  const belowPhoto = gap + blockHeight + margin
  const frameW = canvasW - margin * 2
  const frameH = fixedHeight !== null
    ? fixedHeight - margin - belowPhoto
    : (originalPhoto as { w: number; h: number }).h

  const fitted = await photo.resize(frameW, frameH, { fit: 'inside' }).toBuffer()
  const fittedMeta = await sharp(fitted).metadata()
  const photoW = fittedMeta.width || frameW
  const photoH = fittedMeta.height || frameH

  const canvasH = fixedHeight ?? margin + photoH + belowPhoto
  const photoLeft = Math.round((canvasW - photoW) / 2)
  const photoTop = margin + Math.round((frameH - photoH) / 2)

  const rendered = await Promise.all(
    lines.map(l => renderCaptionLine(l.text, l.size, l.color, l.weight, l.track, frameW))
  )

  const composites: OverlayOptions[] = []

  // A hairline keeps a pale photograph from bleeding into white paper.
  composites.push({
    input: Buffer.from(
      `<svg width="${photoW + 2}" height="${photoH + 2}"><rect x="0.5" y="0.5" width="${photoW + 1}" height="${photoH + 1}" fill="none" stroke="${palette.hairline}" stroke-width="1"/></svg>`
    ),
    left: photoLeft - 1,
    top: photoTop - 1,
  })
  composites.push({ input: fitted, left: photoLeft, top: photoTop })

  const centre = (width: number) => Math.round((canvasW - width) / 2)
  let cursorY = photoTop + photoH + gap

  for (const [i, buffer] of rendered.entries()) {
    const width = (await sharp(buffer).metadata()).width || 0
    composites.push({ input: buffer, left: centre(width), top: cursorY })
    cursorY += lineHeights[i] + lineGap
  }

  cursorY += logoGap - lineGap
  composites.push({ input: logo, left: centre(logoW), top: cursorY })

  if (qrUrl) {
    cursorY += logoHeight + qrGap
    // Always dark-on-light with a quiet zone, on dark paper too: an inverted
    // code without margin is exactly what scanners refuse.
    const qr = await QRCode.toBuffer(qrUrl, {
      width: qrSize,
      margin: 2,
      color: { dark: '#000000', light: '#FFFFFF' },
    })
    composites.push({ input: qr, left: centre(qrSize), top: cursorY })
  }

  return sharp({
    create: { width: canvasW, height: canvasH, channels: 3, background: hexToRgb(palette.paper) },
  })
    .composite(composites)
    .jpeg({ quality, mozjpeg: true })
    .toBuffer()
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const photoId = searchParams.get('id')
  const isPreview = searchParams.get('preview') === '1'

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

    const output = await renderPrint({
      source,
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
