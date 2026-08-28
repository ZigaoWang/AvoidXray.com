import { ImageResponse } from 'next/og'
import { prisma } from '@/lib/db'
import { PUBLIC_PHOTO } from '@/lib/photoVisibility'
import {
  OG_SIZE,
  OG_CONTENT_TYPE,
  CollageBackdrop,
  COLLAGE_TILES,
  ogFonts,
  inlineImage,
  inlineImages,
  logoDataUri,
} from '@/lib/seo/ogCard'
import { randomTileUrls } from '@/lib/seo/ogPhotos'

export const alt = 'Film photographer on AvoidXray'
export const size = OG_SIZE
export const contentType = OG_CONTENT_TYPE

export const revalidate = 86400

type Params = { params: Promise<{ username: string }> }

/**
 * A photographer's preview card.
 *
 * The avatar alone was the whole og:image before this, which meant a shared
 * profile previewed as a hard crop of someone's face with no name on it — and
 * nothing at all for the many accounts that never set one. Their photographs
 * are the reason to click the link, so those are the card.
 */
export default async function Image({ params }: Params) {
  const { username } = await params
  const [fonts, logo] = await Promise.all([ogFonts(), logoDataUri()])

  const user = await prisma.user.findUnique({
    where: { username },
    select: {
      id: true,
      name: true,
      username: true,
      avatar: true,
      _count: { select: { photos: { where: { ...PUBLIC_PHOTO } }, followers: true, following: true } },
    },
  })

  if (!user) {
    return new ImageResponse(
      (
        <div
          style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#0a0a0a',
            fontFamily: 'Inter',
          }}
        >
          <img src={logo} width={384} height={70} alt="" />
        </div>
      ),
      { ...size, fonts },
    )
  }

  const urls = await randomTileUrls({ ...PUBLIC_PHOTO, userId: user.id }, COLLAGE_TILES)

  const [avatar, tiles] = await Promise.all([
    inlineImage(user.avatar, 320),
    inlineImages(urls),
  ])

  const name = user.name || user.username
  const initial = name.trim().charAt(0).toUpperCase() || '?'

  const stats = [
    { value: user._count.photos, label: 'Photos' },
    { value: user._count.followers, label: 'Followers' },
    { value: user._count.following, label: 'Following' },
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
        <CollageBackdrop tiles={tiles.filter((t): t is string => t !== null)} scrim={0.74} />

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
          {avatar ? (
            <img
              src={avatar}
              alt=""
              width={148}
              height={148}
              style={{
                width: 148,
                height: 148,
                borderRadius: 74,
                objectFit: 'cover',
                border: '3px solid rgba(255, 255, 255, 0.85)',
              }}
            />
          ) : (
            // No avatar is common, and an empty circle looks broken. The
            // initial on brand red reads as deliberate.
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 148,
                height: 148,
                borderRadius: 74,
                background: '#D32F2F',
                border: '3px solid rgba(255, 255, 255, 0.85)',
                fontSize: 66,
                fontWeight: 700,
                color: '#ffffff',
              }}
            >
              {initial}
            </div>
          )}

          <div
            style={{
              display: 'flex',
              marginTop: 26,
              fontSize: 54,
              fontWeight: 700,
              letterSpacing: -1,
              color: '#ffffff',
            }}
          >
            {name}
          </div>
          <div
            style={{
              display: 'flex',
              marginTop: 6,
              fontSize: 26,
              fontWeight: 500,
              color: '#9a9a9a',
            }}
          >
            @{user.username}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', marginTop: 30 }}>
            {stats.map((stat, i) => (
              <div key={stat.label} style={{ display: 'flex', alignItems: 'center' }}>
                {i > 0 ? (
                  <div
                    style={{
                      display: 'flex',
                      width: 1,
                      height: 38,
                      background: '#4a4a4a',
                      margin: '0 30px',
                    }}
                  />
                ) : null}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <div style={{ display: 'flex', fontSize: 36, fontWeight: 700, color: '#ffffff' }}>
                    {stat.value.toLocaleString('en-US')}
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      marginTop: 3,
                      fontSize: 14,
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

          <div style={{ display: 'flex', position: 'absolute', bottom: 44 }}>
            <img src={logo} width={148} height={27} alt="" />
          </div>
        </div>
      </div>
    ),
    { ...size, fonts },
  )
}
