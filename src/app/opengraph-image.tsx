import { ImageResponse } from 'next/og'
import { OG_SIZE, OG_CONTENT_TYPE, ogFonts, logoDataUri } from '@/lib/seo/ogCard'

export const alt = 'AvoidXray – Film Photography Community'
export const size = OG_SIZE
export const contentType = OG_CONTENT_TYPE

/**
 * The site-wide preview card. Next inherits this into every route that does
 * not define its own `opengraph-image`, so a shared link to /explore, /films
 * or a profile gets the wordmark rather than a scraper's guess at which
 * favicon to crop.
 */
export default async function Image() {
  const [fonts, logo] = await Promise.all([ogFonts(), logoDataUri()])

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#0a0a0a',
          backgroundImage:
            'radial-gradient(circle at 50% 32%, #1f1111 0%, #0a0a0a 62%)',
          fontFamily: 'Inter',
        }}
      >
        <img src={logo} width={438} height={80} alt="" />
        <div
          style={{
            display: 'flex',
            marginTop: 44,
            fontSize: 36,
            fontWeight: 500,
            color: '#e8e8e8',
            textAlign: 'center',
            maxWidth: 900,
            lineHeight: 1.35,
          }}
        >
          Real film photography, organised by stock and camera
        </div>
        <div
          style={{
            display: 'flex',
            marginTop: 26,
            fontSize: 24,
            fontWeight: 700,
            letterSpacing: 5,
            color: '#D32F2F',
          }}
        >
          AVOIDXRAY.COM
        </div>
      </div>
    ),
    { ...size, fonts },
  )
}
