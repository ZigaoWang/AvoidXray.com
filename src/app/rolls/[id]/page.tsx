import { cache, Fragment } from 'react'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { hiddenUserIds } from '@/lib/blocks'
import Header from '@/components/Header'
import PageShell from '@/components/PageShell'
import MasonryGrid from '@/components/MasonryGrid'
import JsonLd from '@/components/JsonLd'
import Avatar from '@/components/ui/Avatar'
import FollowButton from '@/components/FollowButton'
import ItemActions from '@/components/ItemActions'
import { textLinkClass } from '@/components/ui/TextLink'
import { pageTitleCompactClass, sectionHeadingClass } from '@/components/ui/PageHeader'
import { PUBLIC_PHOTO } from '@/lib/photoVisibility'
import { ALBUM_TAB, FEED_FIRST_PAGE, feedScopeQuery, rollPhotoPage } from '@/lib/photoFeed'
import { withLikeCounts } from '@/lib/counts'
import { breadcrumbJsonLd, collectionJsonLd } from '@/lib/seo/jsonld'
import { OG_BASE, OG_DEFAULT_IMAGE, SITE_URL } from '@/lib/seo/site'
import { canonicalCameraPath, canonicalFilmPath } from '@/lib/seo/slug'
import { displayName, photoAlt } from '@/lib/seo/alt'
import { formatRollDate } from '@/lib/library/rollFields'
import { shotDates } from '@/lib/library/rollHeader'
import { PUBLIC_ROLL_SELECT, publicRollText } from '@/lib/publicRoll'

/**
 * A roll, as anyone sees it: its name, its line and its published frames in
 * the owner's order. A roll with nothing published is a 404, for its owner
 * too, since this is the public page; their whole roll is in the library.
 */

type Params = { params: Promise<{ id: string }> }

const loadRoll = cache(async (id: string) => {
  const roll = await prisma.roll.findUnique({
    where: { id },
    select: {
      ...PUBLIC_ROLL_SELECT,
      owner: { select: { id: true, username: true, name: true, avatar: true } },
    },
  })
  if (!roll) return null
  const published = await prisma.photo.count({ where: { ...PUBLIC_PHOTO, rollId: id } })
  return published > 0 ? { ...roll, published } : null
})

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params
  // notFound() here as well as in the body, as on the album page; the 404
  // status itself comes from src/proxy.ts, which checks before rendering.
  const roll = await loadRoll(id)
  if (!roll) notFound()

  const { name, line } = publicRollText(roll)
  const ownerName = roll.owner.name || roll.owner.username
  const title = `${name} by ${ownerName}`
  const description = `A roll of ${roll.published} film ${roll.published === 1 ? 'photograph' : 'photographs'} by ${ownerName} on AvoidXray${line ? `: ${line}` : ''}.`
  const [cover] = await rollPhotoPage({ ...PUBLIC_PHOTO, rollId: id }, { take: 1 })

  return {
    title,
    description,
    openGraph: {
      ...OG_BASE,
      title: `${name} – AvoidXray`,
      description,
      url: `${SITE_URL}/rolls/${id}`,
      images: [cover ? { url: cover.mediumPath, alt: photoAlt(cover) } : OG_DEFAULT_IMAGE],
    },
    twitter: { card: 'summary_large_image', title, description },
    alternates: { canonical: `${SITE_URL}/rolls/${id}` },
  }
}

export default async function RollPage({ params }: Params) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  const userId = session?.user ? (session.user as { id: string }).id : null

  const roll = await loadRoll(id)
  if (!roll) notFound()

  const isOwner = userId === roll.ownerId
  // A block either way hides the roll, as it hides the owner's photos
  // everywhere else.
  if (!isOwner && (await hiddenUserIds(userId)).includes(roll.ownerId)) notFound()

  const where = { ...PUBLIC_PHOTO, rollId: roll.id }
  const [photos, followsOwner, userLikes] = await Promise.all([
    rollPhotoPage(where, { take: FEED_FIRST_PAGE + 1 }),
    userId && !isOwner
      ? prisma.follow.findUnique({
          where: { followerId_followingId: { followerId: userId, followingId: roll.ownerId } },
          select: { id: true },
        })
      : null,
    userId
      ? prisma.like.findMany({ where: { userId, photo: where }, select: { photoId: true } })
      : [],
  ])
  const hasMore = photos.length > FEED_FIRST_PAGE
  const firstPage = hasMore ? photos.slice(0, FEED_FIRST_PAGE) : photos
  const likedIds = new Set(userLikes.map(l => l.photoId))
  const initialPhotos = (await withLikeCounts(firstPage)).map(photo => ({ ...photo, liked: likedIds.has(photo.id) }))

  const { name } = publicRollText(roll)
  const rollPath = `/rolls/${roll.id}`
  const ownerName = roll.owner.name || roll.owner.username

  // The header line with each catalog entry linked to its page.
  const shot = shotDates(formatRollDate(roll.shotFrom, roll.shotFromPrecision), formatRollDate(roll.shotTo, roll.shotToPrecision))
  const parts: React.ReactNode[] = [
    shot || null,
    roll.filmStock && (
      <Link href={canonicalFilmPath(roll.filmStock)} className={textLinkClass}>
        {displayName(roll.filmStock) ?? roll.filmStock.name}
      </Link>
    ),
    roll.camera && (
      <Link href={canonicalCameraPath(roll.camera)} className={textLinkClass}>
        {displayName(roll.camera) ?? roll.camera.name}
      </Link>
    ),
    roll.lab && (
      <Link href={`/labs/${roll.lab.slug}`} className={textLinkClass}>{roll.lab.name}</Link>
    ),
  ].filter(Boolean)

  return (
    <PageShell header={<Header />}>
      <JsonLd
        data={[
          breadcrumbJsonLd([
            { name: 'Home', path: '/' },
            { name: ownerName, path: `/${roll.owner.username}` },
            { name, path: rollPath },
          ]),
          collectionJsonLd({
            name,
            description: `A roll of ${roll.published} film ${roll.published === 1 ? 'photograph' : 'photographs'} by ${ownerName}.`,
            path: rollPath,
            photos: initialPhotos,
            totalPhotos: roll.published,
          }),
        ]}
      />

      <main id="main-content" tabIndex={-1} className="flex-1 max-w-7xl mx-auto w-full py-8 md:py-16 px-6">
        <Link href={`/${roll.owner.username}?tab=rolls`} className="text-neutral-500 hover:text-white text-sm mb-6 inline-block">
          &larr; {isOwner ? 'Your rolls' : `@${roll.owner.username}'s rolls`}
        </Link>

        {/* Opened like an album: the name, quiet lines under it, no panel. */}
        <div className="flex items-start justify-between gap-4 mb-8">
          <div className="min-w-0">
            <h1 className={`${pageTitleCompactClass} leading-tight`}>{name}</h1>

            {parts.length > 0 && (
              <p className="mt-3 text-sm text-neutral-300">
                {parts.map((part, i) => (
                  <Fragment key={i}>
                    {i > 0 && <span aria-hidden className="text-neutral-600"> · </span>}
                    {part}
                  </Fragment>
                ))}
              </p>
            )}

            <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1">
              <Link href={`/${roll.owner.username}`} className="group inline-flex items-center gap-2">
                <Avatar src={roll.owner.avatar} name={ownerName} size={24} />
                <span className="text-sm text-neutral-300 group-hover:text-white transition-colors">
                  {roll.owner.name || `@${roll.owner.username}`}
                </span>
              </Link>
              {!isOwner && (
                <FollowButton username={roll.owner.username} initialFollowing={Boolean(followsOwner)} />
              )}
            </div>
          </div>

          <div className="-mr-2 shrink-0">
            <ItemActions label={`Actions for ${name}`} copyLink={rollPath} />
          </div>
        </div>

        <div>
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
            <h2 className={sectionHeadingClass}>Photos</h2>
            <span className="text-neutral-500 text-sm">
              {roll.published} {roll.published === 1 ? 'photo' : 'photos'}
            </span>
          </div>

          {/* The roll is the list being browsed, so a photo's prev/next walk
              it in this order. ALBUM_TAB keeps the grid from writing a date or
              likes order into those links; /api/photos serves a roll in its
              own order whatever the tab. */}
          <MasonryGrid
            initialPhotos={initialPhotos}
            initialOffset={hasMore ? FEED_FIRST_PAGE : null}
            tab={ALBUM_TAB}
            scopeQuery={feedScopeQuery({ rollId: roll.id })}
          />
        </div>
      </main>
    </PageShell>
  )
}
