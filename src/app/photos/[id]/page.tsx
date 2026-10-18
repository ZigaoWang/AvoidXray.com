import { cache } from 'react'
import { prisma } from '@/lib/db'
import { notFound } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import { sectionHeadingClass } from '@/components/ui/PageHeader'
import OwnerControls from './OwnerControls'
import FollowButton from '@/components/FollowButton'
import PhotoKeyNav from '@/components/PhotoKeyNav'
import LikeButton from '@/components/LikeButton'
import CommentSection from '@/components/CommentSection'
import Lightbox from '@/components/Lightbox'
import GearCard from '@/components/GearCard'
import ExportButton from '@/components/ExportButton'
import PhotoActions from './PhotoActions'
import PhotoAlbums from './PhotoAlbums'
import type { Metadata } from 'next'
import { blurHashToDataURL } from '@/lib/blurhash'
import JsonLd from '@/components/JsonLd'
import { photoAlt, photoTitle, photoDescription, photographerName, displayName } from '@/lib/seo/alt'
import { photoJsonLd, breadcrumbJsonLd } from '@/lib/seo/jsonld'
import { canonicalFilmPath, canonicalCameraPath } from '@/lib/seo/resolve'
import { SITE_URL } from '@/lib/seo/site'
import { publicUserSelect } from '@/lib/publicUser'
import { isFeedTab, parseFeedScope, resolveScopeAccess, type FeedTab } from '@/lib/photoFeed'
import { photoNeighbors, type Neighbors } from '@/lib/photoNeighbors'
import { commentPage } from '@/lib/comments'
import { canOpenPhotoPage } from '@/lib/photoVisibility'
import { blockedFromInteracting, hiddenUserIds } from '@/lib/blocks'
import { formatCaptureDate, formatDate } from '@/lib/formatDate'
import { mediumSize } from '@/lib/exportFormats'
import { albumsForPhoto } from '@/lib/photoAlbums'
import { relatedPhotos, morePhotosByPhotographer } from '@/lib/relatedPhotos'
import { ButtonLink } from '@/components/ui/Button'
import Avatar from '@/components/ui/Avatar'
import PhotoStrip from '@/components/PhotoStrip'

/** Bytes as a human-readable size, matching the previous HeadObject output. */
function formatBytes(bytes: number | null | undefined): string {
  if (!bytes || bytes <= 0) return ''
  const mb = bytes / (1024 * 1024)
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${(bytes / 1024).toFixed(0)} KB`
}


/**
 * The scope keys the grid passes through when it links to a photo, so
 * prev/next can walk the same list you were looking at. Anything else in the
 * query string is ignored.
 */
function scopeParams(query: Record<string, string | string[] | undefined>): string {
  const params = new URLSearchParams()
  // `order` and `seed` say how the grid was sorted, so the steps follow it.
  for (const key of ['filmStockId', 'cameraId', 'username', 'albumId', 'day', 'period', 'order', 'seed'] as const) {
    const value = query[key]
    if (typeof value === 'string' && value) params.set(key, value)
  }
  return params.toString()
}

/**
 * The photo, deduplicated per request.
 *
 * generateMetadata and the page body both need it, and Next runs them both for
 * every view. Next dedupes `fetch()` but not a Prisma call, so this was the
 * same query twice on every photo page. The include is the union of what the
 * two needed; the like count is cheap and the metadata path simply ignores it.
 */
const loadPhoto = cache(async (id: string) =>
  prisma.photo.findUnique({
    where: { id },
    include: {
      camera: true,
      filmStock: true,
      user: { select: publicUserSelect },
      _count: { select: { likes: true } },
    },
  })
)

/**
 * The viewer, with whether they are an admin: for the page-level visibility
 * rule, and for the Admin link beside Edit.
 */
const loadViewer = cache(async () => {
  const session = await getServerSession(authOptions)
  const id = session?.user ? (session.user as { id: string }).id : null
  if (!id) return null
  const user = await prisma.user.findUnique({ where: { id }, select: { isAdmin: true } })
  return { id, isAdmin: user?.isAdmin === true }
})

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params
  const photo = await loadPhoto(id)

  // notFound() here as well as in the body, so the two agree about what is
  // missing. Neither sets the status: this route has a loading.tsx, so the
  // shell has flushed a 200 before either runs. The 404 comes from src/proxy.ts,
  // which checks before rendering starts.
  if (!photo) notFound()

  // Only a missing row is a 404. An unpublished or private photo still belongs
  // to someone who can open it, so the question is who is looking — the same
  // question the page body asks before it renders.
  // A viewer who may not see it gets the bare not-found title, and nothing that
  // would describe the photograph to them.
  if (!canOpenPhotoPage(photo, await loadViewer())) {
    return { title: 'Photo not found', robots: { index: false, follow: false } }
  }

  // Reachable, but not public: the owner reading their own private photo should
  // see its real title rather than "Photo Not Found" over the picture. It must
  // not be indexed, nor may its links be followed out of a private page.
  const isPublic = photo.published && photo.visibility === 'PUBLIC' && photo.screening === 'CLEAR'

  const title = photoTitle(photo)
  const description = photoDescription(photo)
  const photographer = photographerName(photo.user)

  return {
    title,
    description,
    // No photo page is indexed, public or not. Few carry a caption, so most
    // differ from dozens of others only by the image: 1,100 pages shared 63
    // titles, and Google indexed a scattered handful while ranking none. The
    // film, camera and pairing pages carry the same frames and are what should
    // rank; following stays on so those links still count.
    robots: isPublic ? { index: false, follow: true } : { index: false, follow: false },
    openGraph: {
      title,
      description,
      type: 'article',
      url: `${SITE_URL}/photos/${id}`,
      images: [
        {
          url: photo.mediumPath,
          ...mediumSize(photo.width, photo.height),
          alt: photoAlt(photo),
        },
      ],
      ...(photographer && { authors: [photographer] }),
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [photo.mediumPath],
    },
    alternates: { canonical: `${SITE_URL}/photos/${id}` },
  }
}

export default async function PhotoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { id } = await params
  const query = await searchParams
  const session = await getServerSession(authOptions)
  const userId = session?.user ? (session.user as { id: string }).id : null

  // Prev/next follow the list you arrived from.
  //
  // They used to walk every published photo on the site by date, ignoring
  // context entirely — so stepping through your own private album landed you
  // on a stranger's photo. The grid passes the scope it was showing, and the
  // right to use that scope is checked here rather than trusted.
  const navQuery = scopeParams(query)
  // Appended to every onward link. Without it the first step stayed in the
  // album and the one after it went back to walking the whole site, which read
  // as "next jumps to random photos".
  const navSuffix = navQuery ? `?${navQuery}` : ''
  const navScope = parseFeedScope(new URLSearchParams(navQuery))

  // One wave, not four. None of these depends on the others, and run in
  // sequence they were four round trips of latency before the page could even
  // decide whether the photograph exists.
  const [photo, userLiked, navAccess, blockedIds, albums] = await Promise.all([
    loadPhoto(id),
    userId
      ? prisma.like.findUnique({ where: { userId_photoId: { userId, photoId: id } } })
      : null,
    // Unconditionally, signed in or not: the check this replaced only ran for
    // signed-in viewers, so a signed-out visitor holding an albumId paged
    // through a private album's public frames in album order.
    resolveScopeAccess(navScope, userId),
    hiddenUserIds(userId),
    // Keyed on the id in the URL and the viewer, neither of which depends on
    // the photo having loaded, so it rides along with the first wave.
    albumsForPhoto(id, userId),
  ])

  // A private photo is its owner's alone: everyone else gets the same 404 they
  // would get for a photo that does not exist, rather than a 403 that confirms
  // one is there.
  //
  // src/proxy.ts has already answered 404 to anyone this turns away, by the
  // same rule; this is what renders for them.
  if (!photo) notFound()
  const viewer = await loadViewer()
  if (!canOpenPhotoPage(photo, viewer)) notFound()
  // Blocks apply both ways, as on profiles and in every feed. An admin still
  // sees the photo, since moderation cannot depend on who blocked whom.
  if (viewer && !viewer.isAdmin && (await blockedFromInteracting(viewer.id, photo.userId))) notFound()

  const navOrderParam = typeof query.order === 'string' ? query.order : undefined
  const navOrder: FeedTab = isFeedTab(navOrderParam) ? navOrderParam : 'recent'
  const navSeedParam = Number(query.seed)
  const navSeed = Number.isFinite(navSeedParam) && navSeedParam > 0 ? Math.floor(navSeedParam) : null
  const isOwner = userId === photo.userId

  // Whether this viewer has already blocked the photographer, so the menu can
  // offer Unblock rather than Block. blockedIds covers both directions; only a
  // block this viewer made is theirs to undo.
  const [blockedAuthor, followsAuthor] =
    userId && !isOwner
      ? await Promise.all([
          prisma.block.findUnique({
            where: { blockerId_blockedId: { blockerId: userId, blockedId: photo.userId } },
            select: { id: true },
          }),
          prisma.follow.findUnique({
            where: { followerId_followingId: { followerId: userId, followingId: photo.userId } },
            select: { id: true },
          }),
        ])
      : [null, null]

  // Read from the row rather than issuing a HeadObject against object storage.
  // That call was blocking every render of the site's most-crawled page type and
  // cost roughly 700ms of TTFB purely to print one line in the details panel.
  // Photos uploaded before originalBytes existed show nothing until backfilled
  // (scripts/backfill-photo-sizes.ts).
  const fileSize = formatBytes(photo.originalBytes)

  // The second and last wave: everything that needed the photograph itself.
  //
  // A scope the viewer may not use gets no sequence at all. Dropping just the
  // albumId instead would leave nothing to narrow by, and prev/next would go
  // back to walking the whole site — what navSuffix above exists to prevent.
  const [neighbors, related, firstComments, morePhotos] = await Promise.all([
    navAccess.allowed
      ? photoNeighbors({
          photo,
          order: navOrder,
          seed: navSeed,
          scope: navScope,
          hidden: blockedIds,
          owner: navAccess.owner,
          followingIds: navOrder === 'following' && userId
            ? (await prisma.follow.findMany({ where: { followerId: userId }, select: { followingId: true } }))
                .map(f => f.followingId)
            : [],
        })
      : ({ prevId: null, nextId: null } as Neighbors),
    relatedPhotos(photo, blockedIds),
    commentPage(photo.id, userId),
    morePhotosByPhotographer(photo),
  ])
  const prevPhoto = neighbors.prevId ? { id: neighbors.prevId } : null
  const nextPhoto = neighbors.nextId ? { id: neighbors.nextId } : null
  // Their 1600px copies, for the lightbox to fetch ahead of a step.
  const neighborIds = [neighbors.prevId, neighbors.nextId].filter((id): id is string => id !== null)
  const neighborSrcs = neighborIds.length > 0
    ? (await prisma.photo.findMany({ where: { id: { in: neighborIds } }, select: { mediumPath: true } })).map(p => p.mediumPath)
    : []

  const filmName = displayName(photo.filmStock)

  const gearCards = (photo.camera || photo.filmStock) ? (
    <>
      {photo.camera && <GearCard kind="camera" gear={photo.camera} />}
      {photo.filmStock && <GearCard kind="film" gear={photo.filmStock} />}
    </>
  ) : null

  // Where the link beside the strip goes. The film is the stronger signal of
  // the two, so it is linked when there is one, and the camera when there is not.
  const relatedOn = photo.filmStock
    ? { name: filmName!, href: canonicalFilmPath(photo.filmStock) }
    : photo.camera
      ? { name: displayName(photo.camera)!, href: canonicalCameraPath(photo.camera) }
      : null

  return (
    <div className="min-h-dvh bg-[#0a0a0a] flex flex-col">
      <JsonLd
        data={[
          photoJsonLd({ ...photo, likeCount: photo._count.likes }),
          breadcrumbJsonLd([
            { name: 'Home', path: '/' },
            ...(photo.filmStock
              ? [{ name: 'Film stocks', path: '/films' },
                 { name: filmName!, path: canonicalFilmPath(photo.filmStock) }]
              : [{ name: 'Explore', path: '/explore' }]),
            { name: photoTitle(photo), path: `/photos/${photo.id}` },
          ]),
        ]}
      />
      <Header />

      <main id="main-content" tabIndex={-1} className="flex-1">
        {/*
          The heading for the page, which had none: the only heading on a photo
          page was the h2 over "More like this", so a screen reader moving by
          heading found the related photos and never the photograph itself, and
          the most-crawled page type on the site had no h1.

          Visually hidden because the photograph is the title here, and every
          word this contains is already on the page: the caption in the panel
          beside it, the gear in the two cards below it, the photographer in
          the byline. A visible copy would say everything twice. The text is
          the same string as the document title and the og:title, so nothing is
          being shown to a crawler that is not shown to a reader.
        */}
        <h1 className="sr-only">{photoTitle(photo)}</h1>

        <div className="max-w-7xl mx-auto px-6 py-6 md:py-8">
          {/* Shown to the owner or an admin on a page nobody else can open. */}
          {accessNotice(photo, isOwner) && (
            <p className="mb-4 border-l-2 border-brand pl-3 text-sm text-neutral-300">
              {accessNotice(photo, isOwner)}
            </p>
          )}
          <div className="flex flex-col lg:flex-row gap-6 md:gap-8">
            {/* Left - Photo */}
            <div className="lg:flex-1">
              <div className="border border-neutral-800">
                {/* Portrait photos were sized purely off the viewport height
                    (width = ratio x 80vh) with nothing capping them to the
                    column, so on a phone every one of them ran off the side: a
                    2:3 frame came out 450px wide in a 390px window. Width is
                    the container now, with a max that stops the height passing
                    80vh, so it fits at any aspect ratio without overflowing. */}
                <div
                  className="relative bg-neutral-950 mx-auto w-full"
                  style={{
                    aspectRatio: `${photo.width} / ${photo.height}`,
                    maxWidth: `calc(80vh * ${photo.width} / ${photo.height})`,
                  }}
                >
                  <Image
                    src={photo.mediumPath}
                    alt={photoAlt(photo)}
                    fill
                    className="object-contain"
                    priority
                    placeholder={photo.blurHash ? 'blur' : 'empty'}
                    blurDataURL={blurHashToDataURL(photo.blurHash)}
                  sizes="(max-width: 1024px) 100vw, 880px" />
                  <PhotoKeyNav
                    prevHref={prevPhoto ? `/photos/${prevPhoto.id}${navSuffix}` : null}
                    nextHref={nextPhoto ? `/photos/${nextPhoto.id}${navSuffix}` : null}
                  />
                  <Lightbox
                    photoId={photo.id}
                    src={photo.originalPath}
                    mediumSrc={photo.mediumPath}
                    alt={photoAlt(photo)}
                    width={photo.width}
                    height={photo.height}
                    prevId={prevPhoto?.id}
                    nextId={nextPhoto?.id}
                    navSuffix={navSuffix}
                    blurHash={photo.blurHash}
                    neighborSrcs={neighborSrcs}
                  />
                </div>
                <div className="flex items-center justify-between px-4 py-3 border-t border-neutral-800 bg-neutral-900">
                  {/* Link, not <a>. These were plain anchors, so stepping
                      through a roll threw away and rebuilt the whole app shell
                      on every frame — while the lightbox sitting on the same
                      photo navigated client-side. Same two buttons, two
                      different speeds, depending on which one you reached for. */}
                  {prevPhoto ? (
                    <Link href={`/photos/${prevPhoto.id}${navSuffix}`} title="Previous photo (Left arrow)" aria-keyshortcuts="ArrowLeft" className="-my-3 flex items-center gap-2 py-3 text-neutral-400 hover:text-white text-sm transition-colors">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                      Previous
                    </Link>
                  ) : <span />}
                  {/* Where this frame sits in the set it was opened from. */}
                  {neighbors.position && neighbors.position.total > 1 && (
                    <span className="text-xs text-neutral-500 tabular-nums">
                      {neighbors.position.index.toLocaleString('en-US')} of {neighbors.position.total.toLocaleString('en-US')}
                    </span>
                  )}
                  {nextPhoto ? (
                    <Link href={`/photos/${nextPhoto.id}${navSuffix}`} title="Next photo (Right arrow)" aria-keyshortcuts="ArrowRight" className="-my-3 flex items-center gap-2 py-3 text-neutral-400 hover:text-white text-sm transition-colors">
                      Next
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                    </Link>
                  ) : <span />}
                </div>
              </div>

              {/* One card for both, from the shared component. This was two
                  inline copies differing only in the icon and the label, and a
                  third had since grown on the film and camera pairing page.
                  Under the photo on a wide screen only; on a phone it follows
                  the photographer, below. */}
              {gearCards && <div className="mt-6 hidden lg:grid grid-cols-2 gap-4">{gearCards}</div>}

            </div>

            {/* Right - Info Panel. A flex column rather than space-y so the
                actions card can move up on a phone: stacked under the photo,
                Like was four cards down, below the details. */}
            <div className="lg:w-80 flex flex-col gap-6">
              {/* Author, with Follow beside the link to their profile, so
                  following the photographer does not mean leaving the photo.
                  The caption is theirs, so it sits in the same card: as two
                  cards, a phone stacked one more box under the photo. */}
              <div className="bg-neutral-900 border border-neutral-800 p-4">
                <div className="flex items-center gap-4">
                  <Link href={`/${photo.user.username}`} className="flex flex-1 min-w-0 items-center gap-3 group">
                    <Avatar src={photo.user.avatar} name={photo.user.name || photo.user.username} size={48} />
                    <div className="flex-1 min-w-0">
                      <p className="text-white font-semibold group-hover:text-brand transition-colors truncate">{photo.user.name || photo.user.username}</p>
                      <p className="text-neutral-500 text-sm truncate">@{photo.user.username}</p>
                    </div>
                  </Link>
                  {!isOwner && <FollowButton username={photo.user.username} initialFollowing={Boolean(followsAuthor)} />}
                </div>
                {photo.caption && (
                  <p className="mt-4 text-neutral-300 leading-relaxed">{photo.caption}</p>
                )}
              </div>

              {gearCards && <div className="grid grid-cols-1 md:grid-cols-2 gap-4 lg:hidden">{gearCards}</div>}

              {/* Where this photograph sits in its photographer's work,
                  which the page could only say when you happened to arrive
                  from an album. A private album appears here for its owner
                  alone, and is labeled, so nobody shares a link believing
                  the set behind it is visible. */}
              <PhotoAlbums photoId={photo.id} albums={albums} isOwner={isOwner} />

              {/* Details */}
              <div className="bg-neutral-900 border border-neutral-800 p-4 space-y-3">
                <div className="text-xs text-neutral-500 mb-3 uppercase tracking-wide">Details</div>

                {photo.takenDate && (
                  <div className="flex justify-between items-center">
                    <span className="text-neutral-500 text-sm">Taken</span>
                    <span className="text-white text-sm">
                      {formatCaptureDate(photo.takenDate)}
                    </span>
                  </div>
                )}

                <div className="flex justify-between items-center">
                  <span className="text-neutral-500 text-sm">Uploaded</span>
                  {/* To the rest of that day's uploads on the profile, which
                      is usually the rest of the roll. Days are UTC there. */}
                  <Link
                    href={`/${photo.user.username}?day=${photo.createdAt.toISOString().slice(0, 10)}`}
                    className="text-white text-sm underline decoration-neutral-600 underline-offset-2 hover:decoration-white"
                  >
                    {formatDate(photo.createdAt)}
                  </Link>
                </div>

                <div className="flex justify-between items-center">
                  <span className="text-neutral-500 text-sm">Resolution</span>
                  <span className="text-white text-sm">{photo.width} × {photo.height}</span>
                </div>

                {fileSize && (
                  <div className="flex justify-between items-center">
                    <span className="text-neutral-500 text-sm">Original size</span>
                    <span className="text-white text-sm">{fileSize}</span>
                  </div>
                )}
              </div>

              {/* Actions.

                  Liking comes first. It used to be a 20px gray heart under a
                  divider below both downloads, while the loudest control in
                  the card — the only brand red at rest anywhere on the page —
                  was "Download with Watermark": the screen's visual primary
                  action was taking a copy of someone else's work away, and the
                  one thing that gives the photographer something read as a
                  footnote. Nothing in this card is the page's primary action,
                  so nothing in it is filled. */}
              <div className="order-first lg:order-none bg-neutral-900 border border-neutral-800 p-4 space-y-3">
                <div className="flex items-center gap-4">
                  <LikeButton photoId={photo.id} initialLiked={!!userLiked} initialCount={photo._count.likes} />
                  {isOwner && (
                    <Link href={`/photos/${photo.id}/edit`} className="text-neutral-500 hover:text-white text-sm transition-colors font-medium">
                      Edit
                    </Link>
                  )}
                  {/* Only an admin sees this. It opens the photo's row in the
                      admin table, where publishing, visibility and deleting
                      live, so the page itself stays the same for everyone. */}
                  {viewer?.isAdmin && (
                    <Link href={`/admin/photos?q=${photo.id}`} className="text-neutral-500 hover:text-white text-sm transition-colors font-medium">
                      Admin
                    </Link>
                  )}
                  {/* Beside Like, with the rest of what you can do to this
                      photo. It sat in the author card, which links to a
                      profile, so "Report photo" there read as an action on the
                      person rather than on the picture. */}
                  <div className="ml-auto -mr-2">
                    <PhotoActions
                      photoId={photo.id}
                      ownerUsername={photo.user.username}
                      isOwner={isOwner}
                      isPrivate={photo.visibility === 'PRIVATE'}
                      canBlock={Boolean(userId) && !isOwner}
                      initiallyBlocked={Boolean(blockedAuthor)}
                    />
                  </div>
                </div>

                {/* Side by side: stacked full width, the two outlined buttons
                    were the heaviest thing on a phone screen after the photo. */}
                <div className="grid grid-cols-2 gap-3 border-t border-neutral-800 pt-3">
                  {/* rel is not optional on a target="_blank": without noopener
                      the opened document keeps a handle on this one through
                      window.opener. The new tab is also announced, because
                      losing your place is worse when you did not see it
                      happen. Through the shared button, so it is the same
                      height and the same words as the one under it. */}
                  <ButtonLink
                    href={photo.originalPath}
                    variant="outline"
                    size="md"
                    fullWidth
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Full size
                    <span className="sr-only"> (opens in a new tab)</span>
                  </ButtonLink>

                  <ExportButton
                    photos={[{
                      id: photo.id,
                      width: photo.width,
                      height: photo.height,
                      camera: displayName(photo.camera),
                      filmStock: displayName(photo.filmStock),
                      takenDate: photo.takenDate ? photo.takenDate.toISOString() : null,
                      caption: photo.caption,
                      filmFormat: Array.isArray(photo.filmStock?.format)
                        ? photo.filmStock?.format[0]
                        : photo.filmStock?.format,
                      thumbnailPath: photo.thumbnailPath,
                    }]}
                  />
                </div>

                {isOwner && (
                  <div className="pt-3 border-t border-neutral-800">
                    <OwnerControls photoId={photo.id} visibility={photo.visibility} screening={photo.screening} />
                  </div>
                )}
              </div>

              {/* Comments */}
              <div className="bg-neutral-900 border border-neutral-800 p-4">
                <CommentSection photoId={photo.id} isPhotoOwner={isOwner} initial={firstComments} />

              </div>
            </div>
          </div>
        </div>

        {/*
          What else there is to look at, and why.

          This was four thumbnails under the words "More like this" — no
          indication of what made them alike, and a query that ranked a frame
          sharing only the camera body as highly as one shot on the same film
          with the same camera. The heading now names the connection and links
          to everything on it, and each tile says whose photograph it is,
          because the strip's job is to be a way into other people's work.
        */}
        {related.length > 0 && (
          <section className="border-t border-neutral-900 mt-8">
            <div className="max-w-7xl mx-auto px-6 py-12">
              <div className="flex items-baseline justify-between gap-4 mb-6">
                {/* Ranked by what the photos look like first, so the strip
                    is no longer all one film and the heading no longer names
                    one. The film keeps its link beside it. */}
                <h2 className={sectionHeadingClass}>More like this</h2>
                {relatedOn && (
                  <Link href={relatedOn.href} className="text-neutral-500 hover:text-brand text-sm transition-colors flex-shrink-0">
                    More on {relatedOn.name} &rarr;
                  </Link>
                )}
              </div>

              <PhotoStrip photos={related} />
            </div>
          </section>
        )}

        {morePhotos.length > 0 && (
          <section className={related.length > 0 ? '' : 'border-t border-neutral-900 mt-8'}>
            <div className={`max-w-7xl mx-auto px-6 ${related.length > 0 ? 'pb-12' : 'py-12'}`}>
              <div className="flex items-baseline justify-between gap-4 mb-6">
                <h2 className={sectionHeadingClass}>More from {photo.user.name || `@${photo.user.username}`}</h2>
                <Link href={`/${photo.user.username}`} className="text-neutral-500 hover:text-brand text-sm transition-colors flex-shrink-0">
                  See all &rarr;
                </Link>
              </div>
              {/* One photographer, named in the heading, so not under each tile. */}
              <PhotoStrip photos={morePhotos} showNames={false} />
            </div>
          </section>
        )}
      </main>

      <Footer />
    </div>
  )
}

/**
 * Why this page is closed to everyone else, for the people who can still open
 * it. The owner already knows a photo is private, so that one is only said to
 * an admin; the screening states are said to both, since the owner did not
 * choose them.
 */
function accessNotice(
  photo: { published: boolean; visibility: string; screening: string },
  isOwner: boolean
): string | null {
  if (!photo.published) return 'Not published. The upload did not finish, so this photo appears nowhere else on the site.'
  if (photo.screening === 'PENDING') return 'Being checked. It appears on the site once the automatic check finishes, usually within a minute.'
  if (photo.screening === 'HELD') return 'Held for review. The automatic check flagged this photo, so only the photographer and admins can see it until an admin reviews it.'
  if (photo.screening === 'REJECTED') return 'Removed from public view for breaking the guidelines. Only the photographer and admins can see it.'
  if (photo.visibility === 'PRIVATE' && !isOwner) return 'Private. Only the photographer and admins can open this page.'
  return null
}
