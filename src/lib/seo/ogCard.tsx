/**
 * Shared building blocks for the `opengraph-image` routes.
 *
 * Every social platform crops whatever we hand it into its own aspect ratio.
 * Pointing og:image at a raw film-box or camera product shot meant Instagram
 * cropping a tall product photo down to a wide strip — the reason a shared
 * link used to preview as a fragment of the packaging with no title on it.
 * These helpers render a real 1200x630 card instead, so the crop is ours.
 */
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import sharp from 'sharp'

export const OG_SIZE = { width: 1200, height: 630 }
export const OG_CONTENT_TYPE = 'image/png'

const BG = '#0a0a0a'
const RED = '#D32F2F'
const MUTED = '#8f8f8f'

const FONT_DIR = join(process.cwd(), 'public', 'fonts')

/** Satori needs real font buffers; next/font's CSS variables mean nothing here. */
export async function ogFonts() {
  const [regular, medium, bold] = await Promise.all([
    readFile(join(FONT_DIR, 'Inter-Regular.ttf')),
    readFile(join(FONT_DIR, 'Inter-Medium.ttf')),
    readFile(join(FONT_DIR, 'Inter-Bold.ttf')),
  ])
  return [
    { name: 'Inter', data: regular, weight: 400 as const, style: 'normal' as const },
    { name: 'Inter', data: medium, weight: 500 as const, style: 'normal' as const },
    { name: 'Inter', data: bold, weight: 700 as const, style: 'normal' as const },
  ]
}

let cachedLogo: string | null = null

/** The wordmark as a data URI. Satori cannot load a same-origin `/logo.svg`. */
export async function logoDataUri(): Promise<string> {
  if (!cachedLogo) {
    const svg = await readFile(join(process.cwd(), 'public', 'logo.svg'))
    cachedLogo = `data:image/svg+xml;base64,${svg.toString('base64')}`
  }
  return cachedLogo
}

/**
 * Fetches a remote image and re-encodes it as an inlined PNG.
 *
 * Two reasons not to hand the URL straight to satori: our object storage
 * serves WebP, which the rasteriser does not decode, and an image that fails
 * to load mid-render aborts the whole card rather than degrading. Returning
 * null lets the caller fall back to a text-only layout.
 */
export async function inlineImage(url: string | null | undefined, box = 900): Promise<string | null> {
  if (!url) return null
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) })
    if (!res.ok) return null
    const png = await sharp(Buffer.from(await res.arrayBuffer()))
      .resize(box, box, { fit: 'inside', withoutEnlargement: true })
      .png()
      .toBuffer()
    return `data:image/png;base64,${png.toString('base64')}`
  } catch {
    return null
  }
}

type CardProps = {
  /** Small tracked label above the title, e.g. "FILM STOCK". */
  eyebrow: string
  title: string
  /** Spec line under the title, e.g. "35mm · C-41 · ISO 400". */
  subtitle?: string | null
  /** Sits next to the wordmark along the bottom. */
  footnote?: string | null
  /** Data URI from `inlineImage`. Omitted, the text takes the full width. */
  image?: string | null
  /** `contain` keeps packaging whole; `cover` fills the panel with a photo. */
  imageFit?: 'contain' | 'cover'
  logo: string
}

/** The standard two-panel card: text on the left, artwork on the right. */
export function OgCard({
  eyebrow,
  title,
  subtitle,
  footnote,
  image,
  imageFit = 'contain',
  logo,
}: CardProps) {
  // Long stock names ("Kodak Professional Portra 400") need to come down a
  // size or they wrap to three lines and collide with the wordmark.
  const titleSize = title.length > 34 ? 54 : title.length > 22 ? 64 : 76

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        background: BG,
        fontFamily: 'Inter',
      }}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          width: image ? 690 : 1200,
          padding: '64px 60px',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div
            style={{
              display: 'flex',
              fontSize: 20,
              fontWeight: 700,
              letterSpacing: 5,
              color: RED,
              marginBottom: 22,
            }}
          >
            {eyebrow.toUpperCase()}
          </div>
          <div
            style={{
              display: 'flex',
              fontSize: titleSize,
              fontWeight: 700,
              color: '#ffffff',
              lineHeight: 1.08,
              letterSpacing: -1.5,
            }}
          >
            {title}
          </div>
          {subtitle ? (
            <div
              style={{
                display: 'flex',
                marginTop: 22,
                fontSize: 27,
                fontWeight: 500,
                color: MUTED,
              }}
            >
              {subtitle}
            </div>
          ) : null}
        </div>

        <div style={{ display: 'flex', alignItems: 'center' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logo} height={34} width={186} alt="" />
          {footnote ? (
            <>
              <div
                style={{
                  display: 'flex',
                  width: 1,
                  height: 26,
                  background: '#333333',
                  margin: '0 22px',
                }}
              />
              <div style={{ display: 'flex', fontSize: 24, color: '#b0b0b0' }}>{footnote}</div>
            </>
          ) : null}
        </div>
      </div>

      {image ? (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 510,
            height: '100%',
            padding: imageFit === 'contain' ? 56 : 0,
            backgroundImage: 'linear-gradient(135deg, #1c1c1c 0%, #101010 100%)',
            borderLeft: '1px solid #262626',
            overflow: 'hidden',
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={image}
            alt=""
            style={
              imageFit === 'cover'
                ? { width: 510, height: 630, objectFit: 'cover' }
                : { maxWidth: 398, maxHeight: 518, objectFit: 'contain' }
            }
          />
        </div>
      ) : null}
    </div>
  )
}
