import { ImageResponse } from 'next/og'
import { prisma } from '@/lib/db'
import { PUBLIC_PHOTO } from '@/lib/photoVisibility'
import {
  OG_SIZE,
  OG_CONTENT_TYPE,
  CollageBackdrop,
  COLLAGE_TILES,
  ogFonts,
  logoDataUri,
  inlineImages,
} from '@/lib/seo/ogCard'
import { randomTileUrls } from '@/lib/seo/ogPhotos'

export const alt = 'AvoidXray – Film Photography Community'
export const size = OG_SIZE
export const contentType = OG_CONTENT_TYPE

// Regenerated at most hourly. The collage pulls two dozen thumbnails through
// sharp, which is far too much work to repeat for every scraper hit, and the
// counts underneath it do not move fast enough to need anything fresher.
export const revalidate = 3600

/**
 * The site-wide preview card, mirroring the homepage hero: a contact sheet of
 * real uploads behind the wordmark and the live counts.
 *
 * Next inherits this into every route that does not define its own
 * `opengraph-image`, so a shared link to /explore or /films gets this rather
 * than a scraper's guess at which favicon to crop.
 */
export default async function Image() {
  const [fonts, logo, urls, totalPhotos, totalFilms, totalCameras] = await Promise.all([
    ogFonts(),
    logoDataUri(),
    randomTileUrls({ ...PUBLIC_PHOTO }, COLLAGE_TILES),
    prisma.photo.count({ where: { ...PUBLIC_PHOTO } }),
    prisma.filmStock.count(),
    prisma.camera.count(),
  ])

  const tiles = (await inlineImages(urls)).filter((t): t is string => t !== null)

  const stats = [
    { value: totalPhotos, label: 'Photos' },
    { value: totalFilms, label: 'Films' },
    { value: totalCameras, label: 'Cameras' },
  ]

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          position: 'relative',
          background: '#0a0a0a',
          fontFamily: 'Inter',
          overflow: 'hidden',
        }}
      >
        <CollageBackdrop tiles={tiles} />

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            width: '100%',
            height: '100%',
            position: 'relative',
          }}
        >
          <img src={logo} width={384} height={70} alt="" />
          <div
            style={{
              display: 'flex',
              marginTop: 26,
              fontSize: 30,
              fontWeight: 400,
              color: 'rgba(255, 255, 255, 0.72)',
            }}
          >
            Protect your film. Share your work.
          </div>

          <div style={{ display: 'flex', alignItems: 'center', marginTop: 38 }}>
            {stats.map((stat, i) => (
              <div key={stat.label} style={{ display: 'flex', alignItems: 'center' }}>
                {i > 0 ? (
                  <div
                    style={{
                      display: 'flex',
                      width: 1,
                      height: 44,
                      background: '#4a4a4a',
                      margin: '0 34px',
                    }}
                  />
                ) : null}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <div style={{ display: 'flex', fontSize: 44, fontWeight: 700, color: '#ffffff' }}>
                    {stat.value.toLocaleString('en-US')}
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      marginTop: 4,
                      fontSize: 15,
                      fontWeight: 500,
                      letterSpacing: 2.5,
                      color: '#9a9a9a',
                    }}
                  >
                    {stat.label.toUpperCase()}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    ),
    { ...size, fonts },
  )
}
