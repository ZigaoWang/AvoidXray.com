import { ImageResponse } from 'next/og'
import { prisma } from '@/lib/db'
import { lookupCamera } from '@/lib/seo/resolve'
import { displayName } from '@/lib/seo/alt'
import { PUBLIC_PHOTO } from '@/lib/photoVisibility'
import {
  OG_SIZE,
  OG_CONTENT_TYPE,
  OgCard,
  ogFonts,
  inlineImage,
  logoDataUri,
} from '@/lib/seo/ogCard'

export const alt = 'Camera sample photos on AvoidXray'
export const size = OG_SIZE
export const contentType = OG_CONTENT_TYPE

export const revalidate = 86400

type Params = { params: Promise<{ id: string }> }

export default async function Image({ params }: Params) {
  const { id } = await params
  const camera = await lookupCamera(id)
  const [fonts, logo] = await Promise.all([ogFonts(), logoDataUri()])

  if (!camera) {
    return new ImageResponse(<OgCard eyebrow="Camera" title="Camera not found" logo={logo} />, {
      ...size,
      fonts,
    })
  }

  const name = displayName(camera) ?? camera.name
  const [photoCount, topPhoto] = await Promise.all([
    prisma.photo.count({ where: { ...PUBLIC_PHOTO, cameraId: camera.id } }),
    prisma.photo.findFirst({
      where: { ...PUBLIC_PHOTO, cameraId: camera.id },
      orderBy: [{ likes: { _count: 'desc' } }, { createdAt: 'desc' }],
      select: { mediumPath: true, thumbnailPath: true },
    }),
  ])

  const body = camera.imageStatus === 'approved' ? camera.imageUrl : null
  const bodyImage = await inlineImage(body)
  const image = bodyImage ?? (await inlineImage(topPhoto?.mediumPath ?? topPhoto?.thumbnailPath))

  const subtitle =
    [camera.cameraType, camera.format, camera.year ? String(camera.year) : null]
      .filter(Boolean)
      .join('  ·  ') || null

  return new ImageResponse(
    (
      <OgCard
        eyebrow="Camera"
        title={name}
        subtitle={subtitle}
        footnote={
          photoCount > 0
            ? `${photoCount.toLocaleString('en-US')} sample ${photoCount === 1 ? 'photo' : 'photos'}`
            : 'Camera guide'
        }
        image={image}
        imageFit={bodyImage ? 'contain' : 'cover'}
        logo={logo}
      />
    ),
    { ...size, fonts },
  )
}
