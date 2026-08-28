/* eslint-disable @next/next/no-img-element -- satori rasterises this tree
   itself and never runs next/image; a plain <img> is the only option here. */
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

/**
 * `inlineImage` over a list, a few at a time.
 *
 * The collage needs ~20 thumbnails, and firing every fetch-plus-decode at once
 * is the one thing here heavy enough to matter on a 2GB box. Failures stay in
 * place as null so the caller can keep the grid aligned.
 */
export async function inlineImages(
  urls: (string | null | undefined)[],
  box = 320,
  concurrency = 6,
): Promise<(string | null)[]> {
  const out: (string | null)[] = new Array(urls.length).fill(null)
  let next = 0

  async function worker() {
    while (next < urls.length) {
      const i = next++
      out[i] = await inlineImage(urls[i], box)
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, urls.length) }, worker))
  return out
}

const COLLAGE_COLS = 6
const COLLAGE_ROWS = 4
/** How many frames a caller should fetch for a full-bleed collage. */
export const COLLAGE_TILES = COLLAGE_COLS * COLLAGE_ROWS
const COLLAGE_TILE_W = Math.ceil((OG_SIZE.width - (COLLAGE_COLS - 1) * 2) / COLLAGE_COLS)
const COLLAGE_TILE_H = Math.ceil((OG_SIZE.height - (COLLAGE_ROWS - 1) * 2) / COLLAGE_ROWS)

/**
 * A full-bleed contact sheet with a scrim over it, for cards whose subject is
 * a body of work rather than a product — the homepage and profiles.
 *
 * The homepage hero's ragged masonry is deliberately not reproduced. Uneven
 * columns need the full viewport height to read as anything but noise, and at
 * 1200x630 shown maybe 400px wide in a DM, a uniform grid of larger tiles is
 * the version that still looks like photographs.
 */
export function CollageBackdrop({ tiles, scrim = 0.68 }: { tiles: string[]; scrim?: number }) {
  if (tiles.length === 0) {
    return (
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          top: 0,
          left: 0,
          width: OG_SIZE.width,
          height: OG_SIZE.height,
          backgroundImage: 'radial-gradient(circle at 50% 32%, #1f1111 0%, #0a0a0a 62%)',
        }}
      />
    )
  }

  return (
    <>
      <div style={{ display: 'flex', position: 'absolute', top: 0, left: 0, gap: 2 }}>
        {Array.from({ length: COLLAGE_COLS }, (_, col) => (
          <div key={col} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {Array.from({ length: COLLAGE_ROWS }, (_, row) => {
              // Repeats when the gallery is younger than the grid is big, so a
              // new account is never part sheet part void.
              const tile = tiles[(col * COLLAGE_ROWS + row) % tiles.length]
              return (
                <div
                  key={row}
                  style={{
                    display: 'flex',
                    width: COLLAGE_TILE_W,
                    height: COLLAGE_TILE_H,
                    background: '#161616',
                    overflow: 'hidden',
                  }}
                >
                  <img
                    src={tile}
                    alt=""
                    style={{ width: COLLAGE_TILE_W, height: COLLAGE_TILE_H, objectFit: 'cover' }}
                  />
                </div>
              )
            })}
          </div>
        ))}
      </div>
      {/* Explicit pixels, not percentages: satori does not resolve a
          percentage height against an absolutely positioned box, and the
          scrim silently collapsed to nothing when this was '100%'. */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          top: 0,
          left: 0,
          width: OG_SIZE.width,
          height: OG_SIZE.height,
          background: `rgba(10, 10, 10, ${scrim})`,
        }}
      />
    </>
  )
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
  /**
   * Sample frames for the right panel, from `inlineImages`. Shown as a contact
   * sheet behind `image`, which is the point of a film or camera page: the
   * packaging says which product it is, the frames say what it looks like.
   */
  tiles?: string[]
  logo: string
}

const PANEL_W = 510
const PANEL_COLS = 2
const PANEL_ROWS = 3
/** How many sample frames a caller should fetch for the right panel. */
export const PANEL_TILES = PANEL_COLS * PANEL_ROWS
const PANEL_TILE_W = Math.ceil((PANEL_W - (PANEL_COLS - 1) * 2) / PANEL_COLS)
const PANEL_TILE_H = Math.ceil((630 - (PANEL_ROWS - 1) * 2) / PANEL_ROWS)

function PanelCollage({ tiles }: { tiles: string[] }) {
  return (
    <div style={{ display: 'flex', position: 'absolute', top: 0, left: 0, gap: 2 }}>
      {Array.from({ length: PANEL_COLS }, (_, col) => (
        <div key={col} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {Array.from({ length: PANEL_ROWS }, (_, row) => {
            // Repeats when a stock has only a handful of uploads, so the panel
            // is never part grid part void.
            const tile = tiles[(col * PANEL_ROWS + row) % tiles.length]
            return (
              <div
                key={row}
                style={{
                  display: 'flex',
                  width: PANEL_TILE_W,
                  height: PANEL_TILE_H,
                  background: '#161616',
                  overflow: 'hidden',
                }}
              >
                <img
                  src={tile}
                  alt=""
                  style={{ width: PANEL_TILE_W, height: PANEL_TILE_H, objectFit: 'cover' }}
                />
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}

/** The standard two-panel card: text on the left, artwork on the right. */
export function OgCard({
  eyebrow,
  title,
  subtitle,
  footnote,
  image,
  imageFit = 'contain',
  tiles = [],
  logo,
}: CardProps) {
  const collage = tiles.length > 0
  const hasPanel = collage || Boolean(image)
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
          width: hasPanel ? 690 : 1200,
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

      {hasPanel ? (
        <div
          style={{
            display: 'flex',
            position: 'relative',
            alignItems: 'center',
            justifyContent: 'center',
            width: PANEL_W,
            height: '100%',
            // Spread rather than a key set to undefined: satori trims style
            // values as strings and throws outright on an undefined one.
            ...(collage
              ? { background: '#0a0a0a' }
              : { backgroundImage: 'linear-gradient(135deg, #1c1c1c 0%, #101010 100%)' }),
            borderLeft: '1px solid #262626',
            overflow: 'hidden',
          }}
        >
          {collage ? <PanelCollage tiles={tiles} /> : null}

          {/* Heavier behind packaging so it reads as an object sitting on the
              sheet; barely there when the frames are the whole panel. */}
          {collage ? (
            <div
              style={{
                display: 'flex',
                position: 'absolute',
                top: 0,
                left: 0,
                width: PANEL_W,
                height: OG_SIZE.height,
                background: image ? 'rgba(10, 10, 10, 0.62)' : 'rgba(10, 10, 10, 0.12)',
              }}
            />
          ) : null}

          {image ? (
            <img
              src={image}
              alt=""
              style={
                imageFit === 'cover'
                  ? { width: PANEL_W, height: 630, objectFit: 'cover', position: 'relative' }
                  : {
                      maxWidth: collage ? 340 : 398,
                      maxHeight: collage ? 430 : 518,
                      objectFit: 'contain',
                      position: 'relative',
                    }
              }
            />
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
