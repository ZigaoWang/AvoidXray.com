import { ImageResponse } from 'next/og'
import { prisma } from '@/lib/db'
import { lookupFilm } from '@/lib/seo/resolve'
import { displayName } from '@/lib/seo/alt'
import { filmProcessLabel } from '@/lib/filmFields'
import { PUBLIC_PHOTO } from '@/lib/photoVisibility'
import {
  OG_SIZE,
  OG_CONTENT_TYPE,
  OgCard,
  ogFonts,
  inlineImage,
  logoDataUri,
} from '@/lib/seo/ogCard'

export const alt = 'Film stock sample photos on AvoidXray'
export const size = OG_SIZE
export const contentType = OG_CONTENT_TYPE

// The page itself is force-dynamic because it shuffles photos, but the card
// only shows a name, a spec line and a count. A day of CDN caching is plenty,
// and it keeps a scraper burst off the database.
export const revalidate = 86400

type Params = { params: Promise<{ id: string }> }

export default async function Image({ params }: Params) {
  const { id } = await params
  const film = await lookupFilm(id)
  const [fonts, logo] = await Promise.all([ogFonts(), logoDataUri()])

  if (!film) {
    return new ImageResponse(
      <OgCard eyebrow="Film stock" title="Film stock not found" logo={logo} />,
      { ...size, fonts },
    )
  }

  const name = displayName(film) ?? film.name
  const [photoCount, topPhoto] = await Promise.all([
    prisma.photo.count({ where: { ...PUBLIC_PHOTO, filmStockId: film.id } }),
    // Only needed when there is no packaging shot, but resolving it here keeps
    // the two queries on one round trip.
    prisma.photo.findFirst({
      where: { ...PUBLIC_PHOTO, filmStockId: film.id },
      orderBy: [{ likes: { _count: 'desc' } }, { createdAt: 'desc' }],
      select: { mediumPath: true, thumbnailPath: true },
    }),
  ])

  const box = film.imageStatus === 'approved' ? film.imageUrl : null
  // Packaging is the stronger signal of which stock this is; a sample frame is
  // the better-looking fallback than an empty panel.
  const boxImage = await inlineImage(box)
  const image = boxImage ?? (await inlineImage(topPhoto?.mediumPath ?? topPhoto?.thumbnailPath))

  const subtitle =
    [film.format.join(' / ') || null, filmProcessLabel(film.process), film.iso ? `ISO ${film.iso}` : null]
      .filter(Boolean)
      .join('  ·  ') || null

  return new ImageResponse(
    (
      <OgCard
        eyebrow="Film stock"
        title={name}
        subtitle={subtitle}
        footnote={
          photoCount > 0
            ? `${photoCount.toLocaleString('en-US')} sample ${photoCount === 1 ? 'photo' : 'photos'}`
            : 'Film stock guide'
        }
        image={image}
        imageFit={boxImage ? 'contain' : 'cover'}
        logo={logo}
      />
    ),
    { ...size, fonts },
  )
}
