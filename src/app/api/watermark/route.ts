import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import sharp from 'sharp'
import fs from 'fs'
import path from 'path'
import QRCode from 'qrcode'
import { createCanvas, registerFont } from 'canvas'

type WatermarkStyle = 'minimal' | 'film-strip' | 'polaroid'

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

// Correct logo from public/logo.svg
const LOGO_SVG = `<svg width="307" height="56" viewBox="0 0 307 56" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M0 0H150V56H0V0Z" fill="#D32F2F"/>
<path d="M157 0H307V56H157V0Z" fill="white"/>
<path d="M174 43.4383L185.053 25.2344L183.302 31.6047V28.0187L174.021 13H183.07L188.639 23.2937H192.225L187.226 26.3523L194.398 13H203.025L193.322 28.1031V31.6891L191.508 25.3398L202.92 43.4383H194.229L188.323 33.5664H184.737L189.863 30.6133L182.248 43.4383H174Z" fill="black"/>
<path d="M212.013 43.4383V13H225.197C227.658 13 229.746 13.3937 231.462 14.1812C233.178 14.9687 234.485 16.1148 235.385 17.6195C236.285 19.1242 236.735 20.9523 236.735 23.1039V23.1461C236.735 25.1008 236.264 26.8586 235.322 28.4195C234.38 29.9805 233.121 31.1125 231.546 31.8156L237.621 43.4383H228.91L223.699 32.9547C223.657 32.9547 223.601 32.9547 223.531 32.9547C223.474 32.9547 223.411 32.9547 223.341 32.9547H219.755V43.4383H212.013ZM219.755 27.3438H224.332C225.71 27.3438 226.8 26.9641 227.602 26.2047C228.417 25.4312 228.825 24.4047 228.825 23.125V23.0828C228.825 21.8031 228.41 20.7766 227.581 20.0031C226.751 19.2297 225.654 18.843 224.29 18.843H219.755V27.3438Z" fill="black"/>
<path d="M237.633 43.4383L247.885 13H255.014V19.6234H252.546L245.775 43.4383H237.633ZM243.624 36.7727L245.353 31.1828H259.908L261.638 36.7727H243.624ZM259.486 43.4383L252.694 19.6234V13H257.377L267.628 43.4383H259.486Z" fill="black"/>
<path d="M273.61 43.4383V32.9969L263.126 13H271.374L277.407 25.6562H277.575L283.587 13H291.856L281.351 32.9969V43.4383H273.61Z" fill="black"/>
<path d="M30.2289 19.3195L24.4281 30.7102H31.2414L30.3977 19.3195H30.2289ZM32.0641 42.9656L31.5578 36.2789H21.6227L18.1844 42.9656H10L26.9594 12.5273H36.4305L39.932 42.9656H32.0641Z" fill="white"/>
<path d="M54.2665 42.9656H44.7954L41.2938 12.5273H49.7946L50.997 34.9078H51.1446L61.6915 12.5273H70.4454L54.2665 42.9656Z" fill="white"/>
<path d="M83.1978 18.2859C82.0025 18.2859 80.8846 18.5883 79.8439 19.193C78.8033 19.7977 77.8892 20.6414 77.1017 21.7242C76.3142 22.793 75.7025 24.0375 75.2666 25.4578C74.8307 26.8641 74.6127 28.3828 74.6127 30.0141C74.6127 31.4625 74.8517 32.7281 75.3299 33.8109C75.8221 34.8937 76.5111 35.7305 77.3971 36.3211C78.2971 36.9117 79.3517 37.207 80.5611 37.207C81.7564 37.207 82.8744 36.9047 83.915 36.3C84.9697 35.6953 85.8838 34.8586 86.6572 33.7898C87.4447 32.707 88.0564 31.4555 88.4924 30.0352C88.9424 28.6148 89.1674 27.0961 89.1674 25.4789C89.1674 24.0023 88.9213 22.7297 88.4291 21.6609C87.9369 20.5781 87.2408 19.7484 86.3408 19.1719C85.4549 18.5813 84.4072 18.2859 83.1978 18.2859ZM80.3502 43.493C77.5377 43.493 75.1119 42.9305 73.0728 41.8055C71.0338 40.6805 69.4658 39.1406 68.3689 37.1859C67.2861 35.2172 66.7447 32.9742 66.7447 30.457C66.7447 27.743 67.1666 25.2609 68.0103 23.0109C68.8682 20.7469 70.0494 18.7992 71.5541 17.168C73.0728 15.5227 74.8377 14.25 76.8486 13.35C78.8736 12.45 81.0463 12 83.3666 12C86.2494 12 88.7033 12.5695 90.7283 13.7086C92.7674 14.8336 94.3213 16.3734 95.39 18.3281C96.4728 20.2828 97.0142 22.5187 97.0142 25.0359C97.0142 27.7641 96.5853 30.2602 95.7275 32.5242C94.8838 34.7742 93.6955 36.7219 92.1627 38.3672C90.6439 39.9984 88.8721 41.2641 86.8471 42.1641C84.8361 43.05 82.6705 43.493 80.3502 43.493Z" fill="white"/>
<path d="M104.092 42.9656H96.3511L102.827 12.5273H110.568L104.092 42.9656Z" fill="white"/>
<path d="M114.145 12.5273H125.894C128.327 12.5273 130.464 12.9984 132.307 13.9406C134.163 14.8688 135.604 16.2117 136.631 17.9695C137.671 19.7273 138.192 21.8508 138.192 24.3398C138.192 27.068 137.805 29.5641 137.032 31.8281C136.272 34.0922 135.175 36.0609 133.741 37.7344C132.321 39.3937 130.619 40.6805 128.636 41.5945C126.653 42.5086 124.46 42.9656 122.055 42.9656H107.669L114.145 12.5273ZM120.621 18.7289L116.803 36.7641H121C122.35 36.7641 123.588 36.4969 124.713 35.9625C125.838 35.4281 126.808 34.6617 127.624 33.6633C128.453 32.6648 129.093 31.4625 129.543 30.0562C130.007 28.65 130.239 27.068 130.239 25.3102C130.239 23.9461 130 22.7719 129.522 21.7875C129.044 20.8031 128.348 20.0508 127.434 19.5305C126.534 18.9961 125.43 18.7289 124.122 18.7289H120.621Z" fill="white"/>
</svg>`

// Load inverted logo from file
const LOGO_SVG_INVERTED = fs.readFileSync(path.join(process.cwd(), 'public', 'logo-inverted.svg'), 'utf-8')

// Load square favicon logo
const FAVICON_SVG = fs.readFileSync(path.join(process.cwd(), 'public', 'favicon', 'favicon.svg'), 'utf-8')

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

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const photoId = searchParams.get('id')
  const style = (searchParams.get('style') || 'minimal') as WatermarkStyle
  const isPreview = searchParams.get('preview') === '1'

  // Customization options
  const showCamera = searchParams.get('showCamera') !== '0'
  const showFilm = searchParams.get('showFilm') !== '0'
  const showUsername = searchParams.get('showUsername') !== '0'
  const showDate = searchParams.get('showDate') === '1'
  const showQR = searchParams.get('showQR') === '1'
  const showCaption = searchParams.get('showCaption') !== '0'
  const customDate = searchParams.get('customDate') || ''
  const customCaption = searchParams.get('caption') || 'Shot on film'

  // Get base URL from environment variable (same as email verification)
  // Falls back to production URL if not set
  const baseUrl = process.env.NEXTAUTH_URL || 'https://avoidxray.com'

  if (!photoId) {
    return NextResponse.json({ error: 'Photo ID required' }, { status: 400 })
  }

  const photo = await prisma.photo.findUnique({
    where: { id: photoId },
    include: { camera: true, filmStock: true, user: true }
  })

  if (!photo) {
    return NextResponse.json({ error: 'Photo not found' }, { status: 404 })
  }

  try {
    // Fetch the original image and apply EXIF rotation
    const imageBuffer = await fetchImage(photo.originalPath)
    const rotatedBuffer = await sharp(imageBuffer).rotate().toBuffer()
    const image = sharp(rotatedBuffer)
    const metadata = await image.metadata()

    // Store original dimensions - these will be used for watermark calculations
    const originalWidth = metadata.width || 1600
    const originalHeight = metadata.height || 1200

    const camera = showCamera ? (photo.camera?.name || '') : ''
    const film = showFilm ? (photo.filmStock?.name || '') : ''
    const username = showUsername ? photo.user.username : ''

    // Format date properly
    let date = ''
    if (showDate) {
      if (customDate) {
        // Parse the date from YYYY-MM-DD format in UTC
        const dateObj = new Date(customDate + 'T00:00:00Z')
        date = dateObj.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' })
      } else if (photo.takenDate) {
        // Use taken date if available (stored in UTC)
        date = new Date(photo.takenDate).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' })
      } else {
        // Fall back to upload date
        date = new Date(photo.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' })
      }
    }

    // Generate watermark based on ORIGINAL dimensions
    let result: sharp.Sharp

    switch (style) {
      case 'minimal':
        result = await createMinimalWatermark(image, originalWidth, originalHeight, camera, film)
        break
      case 'film-strip':
        result = await createFilmStripWatermark(image, originalWidth, originalHeight, camera, film, username)
        break
      case 'polaroid':
        result = await createPolaroidWatermark(image, originalWidth, originalHeight, camera, film, username, showCaption ? customCaption : '', date, showQR, photoId, baseUrl)
        break
      default:
        result = await createMinimalWatermark(image, originalWidth, originalHeight, camera, film)
    }

    // If preview mode, resize the FINAL composite to smaller size for faster loading
    if (isPreview) {
      const maxPreviewSize = 800
      // Convert to buffer first to execute all pending operations
      const resultBuffer = await result.png().toBuffer()
      const resultMeta = await sharp(resultBuffer).metadata()
      const resultWidth = resultMeta.width || originalWidth
      const resultHeight = resultMeta.height || originalHeight

      if (resultWidth > maxPreviewSize || resultHeight > maxPreviewSize) {
        result = sharp(resultBuffer).resize(maxPreviewSize, maxPreviewSize, { fit: 'inside' })
      } else {
        result = sharp(resultBuffer)
      }
    }

    // Use high quality for full download, lower for preview
    const quality = isPreview ? 85 : 98
    const outputBuffer = await result.jpeg({ quality, mozjpeg: true }).toBuffer()

    return new NextResponse(new Uint8Array(outputBuffer), {
      headers: {
        'Content-Type': 'image/jpeg',
        'Content-Disposition': isPreview ? 'inline' : `attachment; filename="avoidxray-${photoId}.jpg"`,
        'Cache-Control': isPreview ? 'private, max-age=60' : 'no-store'
      }
    })
  } catch (error) {
    console.error('Watermark generation error:', error)
    return NextResponse.json({ error: 'Failed to generate watermark' }, { status: 500 })
  }
}

async function createMinimalWatermark(image: sharp.Sharp, w: number, h: number, camera: string, film: string) {
  const barHeight = Math.max(90, Math.round(h * 0.08))
  const fontSize = Math.round(barHeight * 0.28)
  const logoHeight = Math.round(barHeight * 0.5)
  const padding = Math.round(barHeight * 0.4)

  // Create info text
  let infoText = ''
  if (camera) infoText += camera
  if (camera && film) infoText += '  •  '
  if (film) infoText += film

  // Create logo
  const logoSvg = Buffer.from(LOGO_SVG)
  const logoBuffer = await sharp(logoSvg).resize({ height: logoHeight }).png().toBuffer()
  const logoMeta = await sharp(logoBuffer).metadata()
  const logoWidth = logoMeta.width || 150

  const composites: sharp.OverlayOptions[] = []

  // Add info text if available
  if (infoText) {
    const infoImage = await createTextImage(infoText, fontSize, '#CCCCCC', { weight: 500, letterSpacing: 1 })
    const infoMeta = await sharp(infoImage).metadata()
    composites.push({
      input: infoImage,
      left: padding,
      top: Math.round((barHeight - (infoMeta.height || fontSize)) / 2)
    })
  }

  // Always add logo
  composites.push({
    input: logoBuffer,
    left: w - logoWidth - padding,
    top: Math.round((barHeight - logoHeight) / 2)
  })

  // Create bottom bar
  const bar = await sharp({
    create: { width: w, height: barHeight, channels: 4, background: { r: 10, g: 10, b: 10, alpha: 1 } }
  })
    .composite(composites)
    .png()
    .toBuffer()

  // Resize image to exact dimensions using fill
  const finalImage = await image
    .resize({ width: w, height: h, fit: 'fill' })
    .toBuffer()

  // Combine image with bar
  return sharp({
    create: { width: w, height: h + barHeight, channels: 3, background: { r: 10, g: 10, b: 10 } }
  }).composite([
    { input: finalImage, top: 0, left: 0 },
    { input: bar, top: h, left: 0 }
  ])
}

async function createFilmStripWatermark(image: sharp.Sharp, w: number, h: number, camera: string, film: string, username: string) {
  const borderSize = Math.max(60, Math.round(w * 0.04))
  const holeSize = Math.round(borderSize * 0.35)
  const holeHeight = Math.round(holeSize * 0.6)
  const holeGap = Math.round(borderSize * 0.8)
  const totalW = w + borderSize * 2
  const totalH = h + Math.round(borderSize * 0.8)

  // Create film strip background with authentic film color
  const filmBg = sharp({
    create: { width: totalW, height: totalH, channels: 3, background: { r: 35, g: 32, b: 28 } }
  })

  // Create sprocket holes
  const holes: sharp.OverlayOptions[] = []
  const holesCount = Math.floor(totalH / holeGap)
  const holeBuffer = await sharp({
    create: { width: holeSize, height: holeHeight, channels: 3, background: { r: 10, g: 10, b: 10 } }
  }).png().toBuffer()

  for (let i = 0; i < holesCount; i++) {
    const y = Math.round(i * holeGap + holeGap / 2)
    holes.push({
      input: holeBuffer,
      left: Math.round((borderSize - holeSize) / 2),
      top: y
    })
    holes.push({
      input: holeBuffer,
      left: totalW - Math.round((borderSize + holeSize) / 2),
      top: y
    })
  }

  // Film edge text with mono font for technical authenticity
  const fontSize = Math.round(borderSize * 0.26)
  const filmText = film?.toUpperCase() || ''
  const textPadding = Math.round(borderSize * 0.3)

  // Resize image to exact dimensions using fill
  const finalImage = await image
    .resize({ width: w, height: h, fit: 'fill' })
    .toBuffer()

  const composites: sharp.OverlayOptions[] = [...holes]
  composites.push({ input: finalImage, left: borderSize, top: Math.round(borderSize * 0.4) })

  // Only add text if there's content
  if (filmText) {
    const topLeftText = await createTextImage(filmText, fontSize, '#F4E5C2', { weight: 700, letterSpacing: 2, fontStyle: 'mono' })
    composites.push({ input: topLeftText, left: borderSize + textPadding, top: 5 })
  }

  // Always show AVOIDXRAY on top right
  const topRightText = await createTextImage('AVOIDXRAY', fontSize, '#F4E5C2', { weight: 700, letterSpacing: 2, fontStyle: 'mono' })
  const topRightMeta = await sharp(topRightText).metadata()
  const topRightWidth = topRightMeta.width || 100
  composites.push({ input: topRightText, left: totalW - borderSize - topRightWidth - textPadding, top: 5 })

  // Bottom left - username or blank
  if (username) {
    const bottomLeftText = await createTextImage(`@${username}`, fontSize, '#F4E5C2', { weight: 700, letterSpacing: 1, fontStyle: 'mono' })
    composites.push({ input: bottomLeftText, left: borderSize + textPadding, top: totalH - Math.round(borderSize * 0.32) })
  }

  // Bottom right - always show AvoidXray.com
  const bottomRightText = await createTextImage('AvoidXray.com', fontSize, '#F4E5C2', { weight: 700, letterSpacing: 1, fontStyle: 'mono' })
  const bottomRightMeta = await sharp(bottomRightText).metadata()
  const bottomRightWidth = bottomRightMeta.width || 100
  composites.push({ input: bottomRightText, left: totalW - borderSize - bottomRightWidth - textPadding, top: totalH - Math.round(borderSize * 0.32) })

  return filmBg.composite(composites)
}

async function createPolaroidWatermark(image: sharp.Sharp, w: number, h: number, camera: string, film: string, username: string, caption: string, date: string, showQR: boolean, photoId: string, baseUrl: string) {
  // Reference size for scaling
  const refSize = 1000
  const scale = Math.max(0.8, Math.min(2.5, Math.min(w, h) / refSize))

  // Classic Polaroid proportions - thicker bottom
  const sideBorder = Math.round(45 * scale)
  const topBorder = Math.round(45 * scale)
  const bottomSpace = Math.round(180 * scale)
  const totalW = w + sideBorder * 2
  const totalH = h + topBorder + bottomSpace

  // Warm cream color like real Polaroid
  const paperColor = { r: 255, g: 252, b: 247 }

  // Create base
  const polaroidBg = sharp({
    create: { width: totalW, height: totalH, channels: 3, background: paperColor }
  })

  // Realistic paper texture with subtle warm tones
  const textureSize = 400
  const textureData = Buffer.alloc(textureSize * textureSize * 4)
  for (let y = 0; y < textureSize; y++) {
    for (let x = 0; x < textureSize; x++) {
      const i = (y * textureSize + x) * 4
      const noise = (Math.random() - 0.5) * 8
      const warmth = Math.sin(y * 0.02) * 2
      textureData[i] = Math.min(255, Math.max(0, paperColor.r + noise))
      textureData[i + 1] = Math.min(255, Math.max(0, paperColor.g + noise + warmth))
      textureData[i + 2] = Math.min(255, Math.max(0, paperColor.b + noise))
      textureData[i + 3] = 15
    }
  }
  const textureBuffer = await sharp(textureData, {
    raw: { width: textureSize, height: textureSize, channels: 4 }
  }).png().toBuffer()

  // Soft drop shadow for the photo (inset effect)
  const shadowBlur = Math.round(6 * scale)
  const photoShadow = await sharp({
    create: {
      width: w + shadowBlur * 2,
      height: h + shadowBlur * 2,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0.12 }
    }
  }).blur(shadowBlur / 2).png().toBuffer()

  // Resize photo
  const finalImage = await image
    .resize({ width: w, height: h, fit: 'fill' })
    .toBuffer()

  const composites: sharp.OverlayOptions[] = [
    { input: textureBuffer, tile: true, blend: 'soft-light' },
    { input: photoShadow, left: sideBorder - shadowBlur, top: topBorder - shadowBlur },
    { input: finalImage, left: sideBorder, top: topBorder }
  ]

  // Bottom content area
  const margin = Math.round(18 * scale)
  const contentStartY = h + topBorder + margin
  const contentEndY = totalH - margin
  const availableHeight = contentEndY - contentStartY

  // Typography
  const titleSize = Math.round(30 * scale)
  const metaSize = Math.round(24 * scale)
  const smallSize = Math.round(20 * scale)

  // Right side icons - size based on available height
  const iconSize = Math.min(availableHeight, Math.round(120 * scale))
  const iconGap = Math.round(12 * scale)
  let rightWidth = 0

  if (showQR) {
    const photoUrl = `${baseUrl}/photos/${photoId}`
    const qrDataUrl = await QRCode.toDataURL(photoUrl, {
      width: iconSize,
      margin: 0,
      color: { dark: '#2d2d2d', light: '#FFFCF7' }
    })
    const qrBuffer = Buffer.from(qrDataUrl.replace(/^data:image\/png;base64,/, ''), 'base64')

    const faviconSvg = Buffer.from(FAVICON_SVG)
    const logoBuffer = await sharp(faviconSvg).resize({ height: iconSize }).png().toBuffer()
    const logoMeta = await sharp(logoBuffer).metadata()
    const logoWidth = logoMeta.width || iconSize

    rightWidth = logoWidth + iconGap + iconSize

    // Center icons vertically in the available space
    const iconY = contentStartY + Math.round((availableHeight - iconSize) / 2)
    const qrX = sideBorder + w - iconSize
    const logoX = qrX - iconGap - logoWidth

    composites.push({ input: logoBuffer, left: logoX, top: iconY })
    composites.push({ input: qrBuffer, left: qrX, top: iconY })
  } else {
    const logoSvg = Buffer.from(LOGO_SVG_INVERTED)
    const logoBuffer = await sharp(logoSvg).resize({ height: iconSize }).png().toBuffer()
    const logoMeta = await sharp(logoBuffer).metadata()
    const logoWidth = logoMeta.width || 100

    rightWidth = logoWidth
    const logoX = sideBorder + w - logoWidth
    const iconY = contentStartY + Math.round((availableHeight - iconSize) / 2)

    composites.push({ input: logoBuffer, left: logoX, top: iconY })
  }

  // Left side text - collect all lines first
  const textX = sideBorder
  const textLines: { buffer: Buffer; height: number }[] = []

  if (caption) {
    const img = await createTextImage(caption, titleSize, '#1a1a1a', { weight: 600 })
    const meta = await sharp(img).metadata()
    textLines.push({ buffer: img, height: meta.height || titleSize })
  }
  if (camera) {
    const img = await createTextImage(camera, metaSize, '#3a3a3a', { weight: 500 })
    const meta = await sharp(img).metadata()
    textLines.push({ buffer: img, height: meta.height || metaSize })
  }
  if (film) {
    const img = await createTextImage(film, metaSize, '#5a5a5a', { weight: 400 })
    const meta = await sharp(img).metadata()
    textLines.push({ buffer: img, height: meta.height || metaSize })
  }
  if (username || date) {
    const parts: string[] = []
    if (username) parts.push(`@${username}`)
    if (date) parts.push(date)
    const img = await createTextImage(parts.join('  •  '), smallSize, '#7a7a7a', { weight: 400 })
    const meta = await sharp(img).metadata()
    textLines.push({ buffer: img, height: meta.height || smallSize })
  }

  // Calculate total text height (just the text, no gaps yet)
  let totalTextOnlyH = 0
  for (const line of textLines) {
    totalTextOnlyH += line.height
  }

  // Calculate flexible gap - distribute remaining space evenly between lines
  const numGaps = textLines.length > 1 ? textLines.length - 1 : 0
  const remainingSpace = availableHeight - totalTextOnlyH
  // Gap is the remaining space divided by gaps, but capped between min and max
  const minGap = Math.round(2 * scale)
  const maxGap = Math.round(12 * scale)
  const flexGap = numGaps > 0
    ? Math.max(minGap, Math.min(maxGap, Math.floor(remainingSpace / numGaps / 2)))
    : 0

  // Recalculate total height with gaps
  const totalTextH = totalTextOnlyH + (flexGap * numGaps)

  // Center text vertically in available space
  let textY = contentStartY + Math.round((availableHeight - totalTextH) / 2)

  for (const line of textLines) {
    composites.push({ input: line.buffer, left: textX, top: textY })
    textY += line.height + flexGap
  }

  return polaroidBg.composite(composites)
}

