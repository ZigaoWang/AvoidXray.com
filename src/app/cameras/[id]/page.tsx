import { prisma } from '@/lib/db'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import SuggestEditButton from '@/components/SuggestEditButton'
import MasonryGrid from '@/components/MasonryGrid'
import CommunityNotes from '@/components/CommunityNotes'
import JsonLd from '@/components/JsonLd'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import type { Metadata } from 'next'
import { resolveCameraSlug, lookupCamera, canonicalFilmPath } from '@/lib/seo/resolve'
import { breadcrumbJsonLd, collectionJsonLd, gearJsonLd } from '@/lib/seo/jsonld'
import { displayName, gearImageAlt, article } from '@/lib/seo/alt'
import GearIdentity from '@/components/GearIdentity'
import { usefulAliases } from '@/lib/aliases'
import { textLinkClass } from '@/components/ui/TextLink'
import { CameraIcon } from '@/components/ui/EmptyState'
import SpecChip from '@/components/SpecChip'
import { SITE_URL, comboUrl } from '@/lib/seo/site'
import { FEED_FIRST_PAGE, feedOrderBy, feedScopeQuery } from '@/lib/photoFeed'
import { descriptionParagraphs, summaryFromDescription } from '@/lib/catalogForm'
import { PUBLIC_PHOTO } from '@/lib/photoVisibility'
import { hiddenPhotoFilter } from '@/lib/blocks'
import { photoCountsByFilmStock, withLikeCounts } from '@/lib/counts'
import { bodyTypeLabel, bodyTypeProse, cameraDetailSpecs, frameFormatLabel } from '@/lib/cameraFields'
import DetailSpecs from '@/components/DetailSpecs'
import type { CameraBodyType } from '@prisma/client'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

function specString(camera: { bodyType: CameraBodyType | null; format: string | null; year: number | null }) {
  const specs = [bodyTypeLabel(camera.bodyType), camera.format, camera.year ? String(camera.year) : null].filter(Boolean)
  return specs.length ? ` (${specs.join(', ')})` : ''
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params
  const camera = await lookupCamera(id)
  // notFound() here as well as in the body, so the two agree about what is
  // missing — but be aware this does NOT fix the status on its own.
  //
  // Measured against this build (Next 16.3.4): a route carrying a loading.tsx
  // answers 200 for an unknown entry no matter where notFound() is called,
  // because the Suspense boundary flushes the shell before either call runs.
  // Blocking metadata does not help — forcing it through htmlLimitedBots moves
  // the title into <head> for a crawler and the status stays 200. Removing the
  // route's loading.tsx is what turns it into a real 404, at the cost of the
  // skeleton. Until that trade is made deliberately, this is a soft 404: the
  // page says Not Found and the status says otherwise.
  if (!camera) notFound()

  const name = displayName(camera) ?? camera.name
  const photoCount = await prisma.photo.count({ where: { ...PUBLIC_PHOTO, cameraId: camera.id } })

  const title = `${name}${specString(camera)}`

  // The summary exists for this: a link preview wants the sentence that says
  // what the camera is, not a description cut off mid-clause.
  const summary = summaryFromDescription(camera.description)
  const description = summary
    ? `${summary} ${photoCount} sample ${photoCount === 1 ? 'photograph' : 'photographs'} from the AvoidXray community.`
    : `${name} sample photos: ${photoCount} real film ${photoCount === 1 ? 'photograph' : 'photographs'} ` +
      `shot on ${article(name)} ${name} by the AvoidXray community. See what this ${
        bodyTypeLabel(camera.bodyType)?.toLowerCase() ?? 'film camera'
      } actually produces before you buy one.`

  const canonical = `${SITE_URL}/cameras/${camera.slug ?? camera.id}`

  // See the note in films/[id]/page.tsx: the raw product shot is the wrong
  // shape for a link preview, and setting `images` here would suppress the
  // 1200x630 card rendered by opengraph-image.tsx.
  return {
    title,
    description,
    keywords: [
      `${name} sample photos`,
      `${name} sample images`,
      `shot on ${name}`,
      `${name} review`,
      `${name} film camera`,
      name,
    ],
    openGraph: {
      title: `${name} – Sample Photos`,
      description,
      type: 'website',
      url: canonical,
    },
    twitter: { card: 'summary_large_image', title: name, description },
    alternates: { canonical },
  }
}

export default async function CameraDetailPage({ params }: Params) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  const userId = (session?.user as { id?: string } | undefined)?.id

  const camera = await resolveCameraSlug(id)
  if (!camera) notFound()

  // Blocked in either direction, matching what /api/photos applies to every
  // page after the first.
  const hidden = await hiddenPhotoFilter(userId)

  // Every photo question on this page asks about the same set of frames, and
  // the four copies of this filter were free to drift apart.
  const scope = { ...PUBLIC_PHOTO, ...hidden, cameraId: camera.id }

  // One round trip for everything the page can ask for at once.
  //
  // These four are independent of each other and were awaited in sequence, so
  // the page paid four latencies before it could render anything. It is
  // force-dynamic, so that is every request. Only the batch below genuinely
  // waits, because it needs the ids these queries return.
  const [photos, totalPhotos, loadedFilm, pairedFilms] = await Promise.all([
    // Only the first screen; MasonryGrid pages the rest through /api/photos.
    prisma.photo.findMany({
      where: scope,
      // Matches the ordering /api/photos pages by; see the film page.
      orderBy: feedOrderBy('recent'),
      take: FEED_FIRST_PAGE + 1,
      select: {
        id: true,
        thumbnailPath: true,
        mediumPath: true,
        width: true,
        height: true,
        blurHash: true,
        caption: true,
        takenDate: true,
        // manufacturer, because displayName prefers it over brand and
        // /api/photos selects it too: without it the first screen named a
        // stock one way and every page scrolled in after it named the same
        // stock another.
        filmStock: { select: { name: true, brand: true, manufacturer: true } },
        user: { select: { name: true, username: true } },
      },
    }),

    prisma.photo.count({ where: scope }),

    // Films actually shot on this body — the reverse side of the combo pages.
    // A disposable arrives loaded, and the film in it is the whole reason its
    // photographs look the way they do. Naming it here, and naming the camera
    // on that film's page, is the one link the catalog could already store and
    // never showed.
    camera.defaultFilmStockId
      ? prisma.filmStock.findUnique({
          where: { id: camera.defaultFilmStockId },
          select: { name: true, slug: true, id: true, brand: true, manufacturer: true },
        })
      : null,

    // Blocked accounts excluded, so the counts here agree with the grid; see
    // the film page for what the mismatch looked like.
    prisma.filmStock.findMany({
      where: { photos: { some: scope } },
      select: { id: true, name: true, brand: true, manufacturer: true, slug: true },
      orderBy: { name: 'asc' },
    }),
  ])

  // The extra row exists only to answer "is there another page"; nothing below
  // renders it, so it is dropped before anything else is asked about these ids.
  const hasMore = photos.length > FEED_FIRST_PAGE
  const pagePhotos = hasMore ? photos.slice(0, FEED_FIRST_PAGE) : photos

  // These three all need ids the queries above returned, and nothing more.
  const [photosWithLikes, userLikes, filmPhotoCounts] = await Promise.all([
    withLikeCounts(pagePhotos),
    userId
      ? prisma.like.findMany({
          where: { userId, photoId: { in: pagePhotos.map((p) => p.id) } },
          select: { photoId: true },
        })
      : [],
    photoCountsByFilmStock(pairedFilms.map((f) => f.id), scope),
  ])
  const likedIds = new Set(userLikes.map((l) => l.photoId))

  const initialPhotos = photosWithLikes.map((p) => ({
    ...p,
    camera: { name: camera.name, brand: camera.brand },
    liked: likedIds.has(p.id),
  }))

  const name = displayName(camera) ?? camera.name
  // Aliases that add something the name does not already say.
  const alternateNames = usefulAliases(name, camera.aliases)

  const displayImage = camera.imageStatus === 'approved' ? camera.imageUrl : null
  // Not gated on imageStatus. That column tracks the moderation state of the
  // product photograph and nothing else, so tying the prose to it meant
  // deleting an image silently deleted the description from the page. The
  // description is reviewed on its own, through the revision pipeline.
  const displayDescription = camera.description
  // Derived, not stored. The lead sentence is the description's first line;
  // keeping a second copy of it in its own column is what let the two drift.
  const leadSentence = summaryFromDescription(displayDescription)
  const canonicalPath = `/cameras/${camera.slug ?? camera.id}`

  const specs = [
    camera.bodyType && { label: 'Type', value: bodyTypeLabel(camera.bodyType)! },
    // Only when it is not the ordinary answer. Nearly every 35mm body is full
    // frame, so printing it on all of them is noise; half-frame or panoramic is
    // the thing a reader actually needs to be told.
    camera.frameFormat && camera.frameFormat !== 'FULL_FRAME'
      && { label: 'Frame', value: frameFormatLabel(camera.frameFormat)! },
    camera.format && { label: 'Format', value: camera.format },
    camera.year && { label: 'Year', value: String(camera.year) },
  ].filter(Boolean) as Array<{ label: string; value: string }>

  return (
    <div className="min-h-dvh bg-[#0a0a0a] flex flex-col">
      <JsonLd
        data={[
          breadcrumbJsonLd([
            { name: 'Home', path: '/' },
            { name: 'Cameras', path: '/cameras' },
            { name, path: canonicalPath },
          ]),
          collectionJsonLd({
            name: `Photos shot on ${article(name)} ${name}`,
            description: `${totalPhotos} film photographs shot on ${article(name)} ${name}.`,
            path: canonicalPath,
            photos: initialPhotos,
            totalPhotos,
            // The camera is the subject of the page, not a standalone entity.
            about: gearJsonLd({
              name,
              description:
                displayDescription ||
                `${name} film camera. ${totalPhotos} sample photographs shot by the AvoidXray community.`,
              path: canonicalPath,
              imageUrl: displayImage,
              brand: camera.brand,
              photoCount: totalPhotos,
              category: 'Film camera',
              properties: specs.map((s) => ({ name: s.label, value: s.value })),
            }),
          }),
        ]}
      />
      <Header />

      <main id="main-content" tabIndex={-1} className="flex-1 max-w-7xl mx-auto w-full py-8 md:py-16 px-4 md:px-6">
        <nav aria-label="Breadcrumb" className="text-sm mb-6">
          <ol className="flex items-center gap-2 text-neutral-500">
            <li><Link href="/" className="hover:text-white">Home</Link></li>
            <li aria-hidden>/</li>
            <li><Link href="/cameras" className="hover:text-white">Cameras</Link></li>
            <li aria-hidden>/</li>
            <li aria-current="page" className="text-neutral-300">{name}</li>
          </ol>
        </nav>

        <div className="bg-gradient-to-br from-neutral-900 to-neutral-950 border border-neutral-800 overflow-hidden mb-8">
          <div className="flex flex-col md:flex-row">
            <div className="w-full md:w-2/5 lg:w-1/3 bg-neutral-900/50 flex items-center justify-center min-h-[200px] p-6 md:p-0">
              {displayImage ? (
                <div className="relative w-full h-full min-h-[200px]">
                  <Image
                    src={displayImage}
                    alt={gearImageAlt(camera, 'camera')}
                    fill
                    className="object-contain"
                    priority
                  sizes="(max-width: 1024px) 100vw, 33vw" />
                </div>
              ) : (
                <div className="w-full aspect-[4/3] flex items-center justify-center text-neutral-700">
                  <CameraIcon size={24} />
                </div>
              )}
            </div>

            <div className="flex-1 p-6 md:p-8 flex flex-col justify-between">
              <div>
                <GearIdentity as="h1" variant="hero" gear={camera} />

                <div className="flex flex-wrap items-center gap-2 mb-4">
                  {specs.map((s) => (
                    <SpecChip key={s.label}>{s.value}</SpecChip>
                  ))}
                  <span className="text-xs text-neutral-500">{totalPhotos} photos</span>
                </div>

                {/* The summary leads and the description follows it. They do
                    different jobs: this one answers "what is this" for someone
                    who has never heard of it, which is also why it is what the
                    metadata and link previews use instead of a truncated
                    description. */}
                {leadSentence && (
                  <p className="mb-3 text-base leading-relaxed text-neutral-200">{leadSentence}</p>
                )}

                <div className="space-y-3 text-sm leading-relaxed text-neutral-400">
                  {descriptionParagraphs(displayDescription ||
                    `${name} is ${bodyTypeProse(camera.bodyType)}${
                      camera.format ? ` shooting ${camera.format}` : ''
                    }${camera.year ? `, introduced in ${camera.year}` : ''}.`, leadSentence)
                    .map((para, i) => (
                      <p key={i}>{para}</p>
                    ))}
                </div>

                {/* The measured specs, under the prose. Twenty-one of these
                    columns were written and four rendered, so an editor could
                    record this body's lens, metering and top shutter speed and
                    the page would still print only its type, format and year. */}
                <DetailSpecs specs={cameraDetailSpecs(camera)} />
              </div>

              {loadedFilm && (
                <p className="mt-3 text-sm text-neutral-500">
                  Comes loaded with{' '}
                  <Link href={canonicalFilmPath(loadedFilm)} className={textLinkClass}>
                    {displayName(loadedFilm) ?? loadedFilm.name}
                  </Link>
                </p>
              )}

              {alternateNames.length > 0 && (
                <p className="mt-3 text-sm text-neutral-500">
                  Also known as{' '}
                  <span className="text-neutral-300">{alternateNames.join(', ')}</span>
                </p>
              )}

              <div className="mt-6">
                {/* The row itself. Every spec the DetailSpecs block above
                    prints is a column on it, so passing the record is what
                    makes all of them editable rather than the eight that used
                    to have a prop each. */}
                <SuggestEditButton
                  type="camera"
                  record={camera}
                  currentImage={displayImage}
                  noDescription={!displayDescription}
                />
              </div>
            </div>
          </div>
        </div>

        {pairedFilms.length > 0 && (
          <section className="mb-10">
            <h2 className="text-lg font-bold text-white mb-4">Films used</h2>
            <div className="flex flex-wrap gap-2">
              {pairedFilms.map((film) => {
                const filmName = displayName(film) ?? film.name
                const href =
                  film.slug && camera.slug ? comboUrl(film.slug, camera.slug) : canonicalFilmPath(film)
                return (
                  <Link
                    key={film.id}
                    href={href}
                    className="text-sm px-3 py-1.5 border border-neutral-800 text-neutral-300 hover:border-brand hover:text-white transition-colors"
                  >
                    {filmName} <span className="text-neutral-600">({filmPhotoCounts.get(film.id) ?? 0})</span>
                  </Link>
                )
              })}
            </div>
          </section>
        )}

        <div className="mb-10">
          <CommunityNotes targetType="camera" targetId={camera.id} targetLabel={name} />
        </div>

        <div>
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-white">Photos</h2>
            {totalPhotos > 0 && (
              <span className="text-neutral-500 text-sm">
                {totalPhotos} {totalPhotos === 1 ? 'photo' : 'photos'}
              </span>
            )}
          </div>

          <MasonryGrid
            initialPhotos={initialPhotos}
            initialOffset={hasMore ? FEED_FIRST_PAGE : null}
            tab="recent"
            scopeQuery={feedScopeQuery({ cameraId: camera.id })}
            emptyMessage={`No photos shot on ${name} yet`}
            emptyLink={{ href: `/upload?camera=${camera.id}`, text: 'Be the first to upload one' }}
          />
        </div>
      </main>

      <Footer />
    </div>
  )
}
