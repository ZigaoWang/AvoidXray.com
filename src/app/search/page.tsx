import { prisma } from '@/lib/db'
import ManufacturerValue from '@/components/ManufacturerValue'
import { searchCatalog } from '@/lib/catalogSearch'
import { Prisma } from '@prisma/client'
import Link from 'next/link'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import { pageTitleClass, sectionHeadingClass } from '@/components/ui/PageHeader'
import Pager from '@/components/ui/Pager'
import { focusRing } from '@/components/ui/focus'

import type { Metadata } from 'next'
import { SITE_URL } from '@/lib/seo/site'
import { parseIntParam } from '@/lib/validation'
import { canonicalCameraPath, canonicalFilmPath } from '@/lib/seo/resolve'
import { PUBLIC_PHOTO } from '@/lib/photoVisibility'
import {
  previewPhotosByGear,
  previewPhotosByAlbum,
  groupPreviews,
  VISIBLE_TO_ANYONE,
  notHidden,
} from '@/lib/previewPhotos'
import { hiddenFilter, hiddenUserIds } from '@/lib/blocks'
import { photoCountsByCamera, photoCountsByFilmStock, visiblePhotoCountsByAlbum, withLikeCounts } from '@/lib/counts'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { GearBrowseCard } from '@/components/GearCard'
import MasonryGrid from '@/components/MasonryGrid'
import AlbumCard, { AlbumByline } from '@/components/AlbumCard'
import EmptyState from '@/components/ui/EmptyState'
import { ButtonLink } from '@/components/ui/Button'
import UnderlineTabs from '@/components/ui/UnderlineTabs'
import Avatar from '@/components/ui/Avatar'
import { searchPhotoContent } from '@/lib/vision'
import { parsePhotoSort, searchPhotos, MAX_RANKED_PHOTOS } from '@/lib/photoSearch'
import BrowseFilters from '@/components/BrowseFilters'
import SearchForm from './SearchForm'
import { headers } from 'next/headers'
import { clientIp, rateLimit } from '@/lib/rateLimit'
import { LIMITS, limitKey } from '@/lib/rateLimitPolicy'
import { hasBlockedWords } from '@/lib/wordFilter'
export const metadata: Metadata = {
  title: 'Search',
  robots: { index: false, follow: false },
  alternates: { canonical: `${SITE_URL}/search` },
}

/**
 * Results per page on a single-type tab, and per section on All.
 *
 * Every list stopped at this many with no way past it, under a tab reading
 * "Photos (230)". The type tabs page now, and All links each section to its
 * tab when there is more than it shows.
 */
const RESULTS_PER_PAGE = 50


/** Photos shown on All when other kinds of result come first: two rows on a phone, one or two on a desktop. */
const ALL_TAB_PHOTO_PREVIEW = 12

/** What a tile in the site's grid draws. */
const PHOTO_TILE_SELECT = {
  id: true,
  thumbnailPath: true,
  mediumPath: true,
  width: true,
  height: true,
  blurHash: true,
  caption: true,
  filmStock: { select: { name: true, brand: true, manufacturer: true } },
  camera: { select: { name: true, brand: true } },
  user: { select: { name: true, username: true } },
} as const satisfies Prisma.PhotoSelect

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string; type?: string; film?: string; camera?: string; user?: string; album?: string; sort?: string; page?: string }> }) {
  const { q: rawQuery = '', type: typeParam = 'all', film, camera, user: scopeUser, album: scopeAlbum, sort: rawSort, page: pageParam } = await searchParams
  // Searching inside a profile or an album is a search of its photos; people,
  // albums and gear results do not apply there.
  const scopedToPhotos = Boolean(scopeUser || scopeAlbum)
  const type = scopedToPhotos ? 'photos' : typeParam
  // No sort means relevance: what the photo shows, then caption matches.
  const sort = parsePhotoSort(rawSort)
  const page = parseIntParam(pageParam ?? null, { fallback: 1, min: 1, max: 100_000 })
  // Only a single-type tab pages; All always shows the first of each.
  const skipFor = (tab: string) => (type === tab ? (page - 1) * RESULTS_PER_PAGE : 0)
  // Trimmed before the empty check: a query of only spaces matched everything.
  const q = rawQuery.trim()

  if (!q) {
    return (
      <div className="min-h-dvh bg-[#0a0a0a] flex flex-col">
        <Header />
        <main id="main-content" tabIndex={-1} className="flex-1 max-w-7xl mx-auto w-full py-10 md:py-16 px-6">
          <h1 className={`${pageTitleClass} mb-6`}>Search</h1>
          {/* The same box as above results, so the page does not change shape
              when the first search lands. */}
          <SearchForm user={scopeUser} album={scopeAlbum} autoFocus />
          <p className="text-sm text-neutral-500">
            Search photos by what is in them, in English or Chinese, or find people, albums, film stocks and cameras by name.
          </p>
        </main>
        <Footer />
      </div>
    )
  }

  const query = q.toLowerCase()

  // Slurs, sexual words and requests for nudity get no results at all, and the
  // page does not repeat the query back.
  if (hasBlockedWords(q, 'search')) {
    return (
      <div className="min-h-dvh bg-[#0a0a0a] flex flex-col">
        <Header />
        <main id="main-content" tabIndex={-1} className="flex-1 max-w-7xl mx-auto w-full py-10 md:py-16 px-6">
          <h1 className={`${pageTitleClass} mb-6`}>Search</h1>
          <EmptyState message="No results" hint="Try searching for something else." />
        </main>
        <Footer />
      </div>
    )
  }

  // Started first: it is the slowest thing the page waits for, and nothing it
  // needs depends on the rest. Over the limit, the page answers from captions.
  const allowed = rateLimit(
    limitKey('content-search', clientIp(await headers())),
    LIMITS.contentSearch.perIp.limit,
    LIMITS.contentSearch.perIp.windowMs
  ).ok
  const contentSearch = allowed ? searchPhotoContent(q, MAX_RANKED_PHOTOS) : Promise.resolve(null)

  const session = await getServerSession(authOptions)
  const viewerId = (session?.user as { id?: string } | undefined)?.id ?? null
  const hiddenIds = await hiddenUserIds(viewerId)
  const hidden = hiddenFilter(hiddenIds)

  /**
   * What this viewer may see, for the photo previews and counts hanging off a
   * camera or film result.
   *
   * Those relations were loaded with no filter at all, so a search result could
   * preview a private or still-unpublished frame, and every count included
   * them — which also disclosed how many private photos a stock had.
   */
  const photoScope: Prisma.PhotoWhereInput = { ...PUBLIC_PHOTO, ...hidden }

  // What the photos show, from the vision worker, alongside caption matches.
  // Null when the worker is unavailable, and then captions are all there is.
  const contentMatches = (await contentSearch) ?? []
  const contentIds = contentMatches.map(m => m.id)
  const contentIdSet = new Set(contentIds)


  const userWhere: Prisma.UserWhereInput = {
    AND: [
      {
        OR: [
          { username: { contains: query, mode: 'insensitive' } },
          { name: { contains: query, mode: 'insensitive' } },
        ],
      },
      // A blocked account should not be findable by the person who blocked
      // them, in either direction.
      ...(hiddenIds.length > 0 ? [{ id: { notIn: hiddenIds } }] : []),
    ],
  }

  /**
   * Albums this viewer may find.
   *
   * Public ones, plus their own whatever its visibility — the same rule the
   * photo feed applies to a photograph. Somebody searching for an album they
   * made and set to private should reach it; nobody else should learn it
   * exists. Blocked accounts drop out in both directions, as they do
   * everywhere else on this page.
   */
  const albumWhere: Prisma.CollectionWhereInput = {
    AND: [
      {
        OR: [
          { name: { contains: query, mode: 'insensitive' } },
          { description: { contains: query, mode: 'insensitive' } },
        ],
      },
      { OR: [{ public: true }, ...(viewerId ? [{ userId: viewerId }] : [])] },
      ...(hiddenIds.length > 0 ? [{ userId: { notIn: hiddenIds } }] : []),
    ],
  }

  /**
   * One page of photos. Matching, scope, order and the filter counts live in
   * photoSearch.ts; this fetches the tiles for the page it chose.
   */
  // Alternate names have to be resolved before the film query, so it can
  // filter on the ids they matched.
  const [filmMatches, cameraMatches] = await Promise.all([
    searchCatalog('film', query, 50),
    searchCatalog('camera', query, 50),
  ])
  const filmIds = filmMatches.map((m) => m.id)
  const aliasByFilmId = new Map(filmMatches.map((m) => [m.id, m.matchedAlias]))
  const cameraIds = cameraMatches.map((m) => m.id)
  const aliasByCameraId = new Map(cameraMatches.map((m) => [m.id, m.matchedAlias]))

  // Named for the line above the results: "Searching @mia's photos".
  const scopeLabel = scopeUser
    ? `@${scopeUser}'s photos`
    : scopeAlbum
      ? await prisma.collection
          .findFirst({ where: { id: scopeAlbum, OR: [{ public: true }, ...(viewerId ? [{ userId: viewerId }] : [])] }, select: { name: true } })
          .then(a => (a ? `the album ${a.name}` : 'an album you cannot see'))
      : null

  // Run on every tab: the Photos tab's count and the filters come from it.
  const photoSearch = await searchPhotos({
        query,
        contentIds,
        scope: { user: scopeUser, album: scopeAlbum, film, camera },
        // Photos shot on the films and cameras the words name: "kodak" finds
        // what was shot on Kodak, not only frames of a Kodak box.
        gear: { filmIds, cameraIds },
        sort,
        viewerId,
        hidden: hiddenIds,
        skip: skipFor('photos'),
        take: RESULTS_PER_PAGE,
      })
  async function photoPage() {
    const ids = photoSearch.ids
    if (!ids.length) return []
    const rows = await prisma.photo.findMany({ where: { id: { in: ids } }, select: PHOTO_TILE_SELECT })
    const byId = new Map(rows.map(r => [r.id, r]))
    return ids.map(id => byId.get(id)).filter(r => r !== undefined)
  }


  const [photos, users, cameras, films, albums] = await Promise.all([
    type === 'all' || type === 'photos' ? photoPage() : [],
    type === 'all' || type === 'users' ? prisma.user.findMany({
      where: userWhere,
      include: { _count: { select: { photos: { where: PUBLIC_PHOTO } } } },
      // A total order, so a page boundary cannot repeat or drop someone.
      orderBy: [{ username: 'asc' }],
      skip: skipFor('users'),
      take: RESULTS_PER_PAGE
    }) : [],
    type === 'all' || type === 'cameras' ? prisma.camera.findMany({
      // Matched by id, like film stocks, so alternate names and the brand
      // relation both count. This page and the type-ahead ran different
      // queries, so a body findable in one was missing from the other.
      where: { id: { in: cameraIds } },
      orderBy: { name: 'asc' },
      take: 50
    }) : [],
    type === 'all' || type === 'films' ? prisma.filmStock.findMany({
      // Matched by id, so alternate names count: "5219" has to find Vision3
      // 500T even though the query appears nowhere in its name.
      where: { id: { in: filmIds } },
      include: {
        // Both sides of the manufacturer question, so a result says who
        // actually makes it in the same words the film page uses.
        brandRef: { select: { name: true } },
        manufacturedBy: { select: { name: true } },
      },
      orderBy: { name: 'asc' },
      take: 50
    }) : [],
    type === 'all' || type === 'albums' ? prisma.collection.findMany({
      where: albumWhere,
      select: {
        id: true,
        name: true,
        description: true,
        user: { select: { username: true, name: true, avatar: true } },
      },
      // Newest first, with the id breaking the tie: albums made in one import
      // share a createdAt, and without a total order the same search can
      // return them in a different order each time.
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: skipFor('albums'),
      take: RESULTS_PER_PAGE
    }) : [],
    ])

  // The preview strips, picked in SQL now that the results are known. Asking
  // Prisma for four photos per result fetched *every* photo of all hundred
  // matched cameras and film stocks and kept four of each, so searching a
  // common word was the most expensive page on the site.
  // The photo counts ride along here, for the same reason and off the same
  // ids: a `_count` on the queries above aggregates the whole Photo table to
  // label at most fifty cards.
  const [cameraPreviews, filmPreviews, cameraPhotoCounts, filmPhotoCounts, albumPreviews, albumPhotoCounts] =
    await Promise.all([
    previewPhotosByGear({
      key: 'cameraId',
      parents: cameras.map((c) => c.id),
      where: Prisma.sql`${VISIBLE_TO_ANYONE} ${notHidden(hiddenIds)}`,
      order: 'recent',
    }),
    previewPhotosByGear({
      key: 'filmStockId',
      parents: films.map((f) => f.id),
      where: Prisma.sql`${VISIBLE_TO_ANYONE} ${notHidden(hiddenIds)}`,
      order: 'recent',
    }),
    photoCountsByCamera(cameras.map((c) => c.id), photoScope),
    photoCountsByFilmStock(films.map((f) => f.id), photoScope),
    // A public album can hold a private photo, and the strip a stranger sees
    // must not include it. Your own album shows your own frames, which is what
    // the viewer clause adds.
    previewPhotosByAlbum({
      albumIds: albums.map((a) => a.id),
      where: viewerId
        ? Prisma.sql`((${VISIBLE_TO_ANYONE}) OR p."userId" = ${viewerId}) ${notHidden(hiddenIds)}`
        : Prisma.sql`${VISIBLE_TO_ANYONE} ${notHidden(hiddenIds)}`,
    }),
    visiblePhotoCountsByAlbum(albums.map((a) => a.id), viewerId),
  ])
  const photosByCamera = groupPreviews(cameraPreviews, 'cameraId')
  const photosByFilm = groupPreviews(filmPreviews, 'filmStockId')
  const photosByAlbum = groupPreviews(albumPreviews, 'collectionId')

  // Counted rather than measured off the lists above: those are capped at 50
  // and only fetched for the tab being shown.
  const [photoTotal, userTotal, albumTotal] = await Promise.all([
    Promise.resolve(photoSearch.total),
    prisma.user.count({ where: userWhere }),
    prisma.collection.count({ where: albumWhere }),
  ])

  // The heart on a tile has to open in the right state, as it does on every
  // other grid.
  const [photosWithLikes, viewerLikes] = await Promise.all([
    withLikeCounts(photos),
    viewerId
      ? prisma.like.findMany({
          where: { userId: viewerId, photoId: { in: photos.map((p) => p.id) } },
          select: { photoId: true },
        })
      : [],
  ])
  const likedIds = new Set(viewerLikes.map((like) => like.photoId))
  const photoResults = photosWithLikes.map((photo) => ({ ...photo, liked: likedIds.has(photo.id) }))

  /**
   * What each tab would find, counted whichever tab is open.
   *
   * The labels used to read the fetched arrays, and only the active type is
   * fetched — so opening Films said "Photos (0)" over a search with sixteen
   * photographs in it, and every tab claimed the others were empty. The two
   * gear counts come from the matcher above, which runs for every request
   * because the photo filter needs its ids.
   */
  const tabHref = (tab: string, onPage = 1) => {
    const params = new URLSearchParams({ q, type: tab })
    if (film) params.set('film', film)
    if (camera) params.set('camera', camera)
    if (scopeUser) params.set('user', scopeUser)
    if (scopeAlbum) params.set('album', scopeAlbum)
    if (sort !== 'relevant') params.set('sort', sort)
    if (onPage > 1) params.set('page', String(onPage))
    return `/search?${params}`
  }

  /**
   * A section's heading. On All it carries a link to the section's own tab
   * whenever the tab has more than All shows; on the tab itself the heading
   * is for screen readers only, since the tab already names it.
   */
  const sectionHeading = (title: string, tab: string, shown: number, total: number) =>
    type === 'all' ? (
      <div className="mb-6 flex items-baseline justify-between gap-4">
        <h2 className={sectionHeadingClass}>{title}</h2>
        {total > shown && (
          <Link href={tabHref(tab)} className={`text-sm text-neutral-400 hover:text-white ${focusRing}`}>
            See all {total}
          </Link>
        )}
      </div>
    ) : (
      <h2 className="sr-only">{title}</h2>
    )

  const pager = (total: number) => (
    <Pager
      page={page}
      lastPage={Math.max(1, Math.ceil(total / RESULTS_PER_PAGE))}
      hrefFor={next => tabHref(type, next)}
    />
  )

  const tabs = [
    { id: 'all', label: 'All', count: 0 },
    { id: 'photos', label: `Photos (${photoTotal})`, count: photoTotal },
    { id: 'films', label: `Film stocks (${filmMatches.length})`, count: filmMatches.length },
    { id: 'cameras', label: `Cameras (${cameraMatches.length})`, count: cameraMatches.length },
    { id: 'users', label: `People (${userTotal})`, count: userTotal },
    { id: 'albums', label: `Albums (${albumTotal})`, count: albumTotal },
  ]

  /**
   * Where photos go on All, and how many.
   *
   * Photos came first and fifty deep, so searching "kodak" meant scrolling
   * past a wall of frames to reach the Kodak films and cameras, which are
   * what the word names. When anything else matches, those compact sections
   * lead and the photos follow as a short preview with a link to the rest.
   * A search that finds only photos still shows them first and in full.
   */
  const othersFound = albums.length + users.length + cameras.length + films.length > 0
  const photosLast = type === 'all' && othersFound
  const shownPhotos = photosLast ? photoResults.slice(0, ALL_TAB_PHOTO_PREVIEW) : photoResults
  const photoSection = (type === 'all' || type === 'photos') && photos.length > 0 && (
    <section className="mb-10">
      {sectionHeading('Photos', 'photos', shownPhotos.length, photoTotal)}
      {/* The same filters and sort as the film and camera lists, over the
          films and cameras these results contain. With the photos they
          filter, rather than above the film and camera results on All. */}
      <div className="mb-2">
      <BrowseFilters
        basePath="/search"
        keep={Object.fromEntries(Object.entries({ q, type, user: scopeUser, album: scopeAlbum }).filter(([, v]) => v && v !== 'all')) as Record<string, string>}
        groups={[
          {
            key: 'film',
            label: 'Film stock',
            values: photoSearch.films.map(f => f.id),
            labels: Object.fromEntries(photoSearch.films.map(f => [f.id, f.name])),
            counts: Object.fromEntries(photoSearch.films.map(f => [f.id, f.count])),
          },
          {
            key: 'camera',
            label: 'Camera',
            values: photoSearch.cameras.map(c => c.id),
            labels: Object.fromEntries(photoSearch.cameras.map(c => [c.id, c.name])),
            counts: Object.fromEntries(photoSearch.cameras.map(c => [c.id, c.count])),
          },
        ]}
        sort={{ key: 'sort', values: ['relevant', 'recent', 'popular'], labels: { relevant: 'Best match', recent: 'Newest', popular: 'Most liked' }, defaultValue: 'relevant' }}
        active={{ film, camera, sort: sort === 'relevant' ? undefined : sort }}
        shown={photoSearch.total}
        total={photoSearch.unfilteredTotal}
        noun={{ one: 'photo', other: 'photos' }}
      />
      </div>
      {/* Said where it applies: these were not tagged by anyone, and the
          model behind them gets some wrong. */}
      {shownPhotos.some(p => contentIdSet.has(p.id)) && (
        <p className={`${type === 'all' ? '-mt-3 ' : ''}mb-5 text-sm text-neutral-500`}>
          Some of these were found by what is in the photo, using image recognition. A few may not fit.
        </p>
      )}
      {/* The site's grid, not a second one. This was a rectangular grid
          of its own: every frame center-cropped to 3:2 whatever shape it
          was shot in, snapping in over a flat gray box, with no film
          stock, no camera and no heart — so the one page whose argument
          is "see how this stock renders" was the page that cropped the
          frame and flattened the color. */}
      <MasonryGrid photos={shownPhotos} />
      {type === 'photos' && pager(photoTotal)}
    </section>
  )

  return (
    <div className="min-h-dvh bg-[#0a0a0a] flex flex-col">
      <Header />

      <main id="main-content" tabIndex={-1} className="flex-1 max-w-7xl mx-auto w-full py-10 md:py-16 px-6">
        {/* The same visible title as the empty page, so the first search does
            not make the heading vanish from over the box. */}
        <h1 className={`${pageTitleClass} mb-6`}>
          Search<span className="sr-only"> results for {q}</span>
        </h1>
        {/* The query, editable where the results are. The page only echoed it
            back, so a phone, which has no search box in its header bar,
            had to go back to change one word. A new search starts on All. */}
        <SearchForm q={q} user={scopeUser} album={scopeAlbum} />
        {/* What this search is inside of, with a way out to the whole site. */}
        {scopeLabel && (
          <div className="mb-6 flex flex-wrap items-center gap-2 text-sm text-neutral-400">
            <span>Searching {scopeLabel}</span>
            <Link
              href={`/search?${new URLSearchParams({ q })}`}
              className={`border border-neutral-700 px-2 py-0.5 text-neutral-300 hover:border-white hover:text-white ${focusRing}`}
            >
              Search everywhere instead
            </Link>
          </div>
        )}

        {!scopedToPhotos && (
        <UnderlineTabs
          label="Result types"
          // Only kinds with results, plus All and whichever tab is open: five
          // tabs reading "(0)" ran off a phone screen and offered nothing.
          tabs={tabs
            .filter(tab => tab.id === 'all' || tab.id === type || tab.count > 0)
            .map(tab => ({ href: tabHref(tab.id), label: tab.label, current: type === tab.id }))}
        />
        )}


        {!photosLast && photoSection}

        {/* Films */}
        {(type === 'all' || type === 'films') && films.length > 0 && (
          <section className="mb-10">
            {sectionHeading('Film stocks', 'films', films.length, filmMatches.length)}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {films.map((film, cardIndex) => (
                <GearBrowseCard
                  key={film.id}
                  kind="film"
                  // The brand from the relation, as the film page does, so the
                  // name and the manufacturer beside it come from one source.
                  gear={{ ...film, brand: film.brandRef.name }}
                  href={canonicalFilmPath(film)}
                  previews={photosByFilm.get(film.id) ?? []}
                  photoCount={filmPhotoCounts.get(film.id) ?? 0}
                  cardIndex={cardIndex}
                  as="h3"
                  extraFact={
                    <ManufacturerValue
                      size="small"
                      status={film.manufacturerStatus}
                      brandName={film.brandRef.name}
                      manufacturerName={film.manufacturedBy?.name}
                    />
                  }
                  // Why this came back for a query its name does not contain —
                  // e.g. "5219" finding Vision3 500T.
                  alsoKnownAs={aliasByFilmId.get(film.id)}
                />
              ))}
            </div>
          </section>
        )}

        {/* Cameras */}
        {(type === 'all' || type === 'cameras') && cameras.length > 0 && (
          <section className="mb-10">
            {sectionHeading('Cameras', 'cameras', cameras.length, cameraMatches.length)}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {cameras.map((camera, cardIndex) => (
                <GearBrowseCard
                  key={camera.id}
                  kind="camera"
                  gear={camera}
                  href={canonicalCameraPath(camera)}
                  previews={photosByCamera.get(camera.id) ?? []}
                  photoCount={cameraPhotoCounts.get(camera.id) ?? 0}
                  cardIndex={cardIndex}
                  // h3: these sit under the section heading above them.
                  as="h3"
                  // Why this came back for a query its name does not contain,
                  // e.g. "Stylus" finding the Mju.
                  alsoKnownAs={aliasByCameraId.get(camera.id)}
                />
              ))}
            </div>
          </section>
        )}

        {/* Users */}
        {(type === 'all' || type === 'users') && users.length > 0 && (
          <section className="mb-10">
            {sectionHeading('People', 'users', users.length, userTotal)}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {users.map(user => (
                <Link key={user.id} href={`/${user.username}`} className="flex items-center gap-4 p-4 bg-neutral-900 border border-neutral-800 hover:border-brand transition-colors">
                  <Avatar src={user.avatar} name={user.name || user.username} size={48} />
                  <div className="min-w-0 flex-1">
                    <p className="text-white font-semibold truncate">{user.name || user.username}</p>
                    <p className="text-neutral-500 text-sm">@{user.username} · {user._count.photos} {user._count.photos === 1 ? 'photo' : 'photos'}</p>
                  </div>
                </Link>
              ))}
            </div>
            {type === 'users' && pager(userTotal)}
          </section>
        )}

        {/* Albums */}
        {(type === 'all' || type === 'albums') && albums.length > 0 && (
          <section className="mb-10">
            {sectionHeading('Albums', 'albums', albums.length, albumTotal)}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {albums.map((album, cardIndex) => (
                <AlbumCard
                  key={album.id}
                  album={album}
                  previews={photosByAlbum.get(album.id) ?? []}
                  photoCount={albumPhotoCounts.get(album.id) ?? 0}
                  cardIndex={cardIndex}
                  byline={album.user ? <AlbumByline user={album.user} /> : undefined}
                />
              ))}
            </div>
            {type === 'albums' && pager(albumTotal)}
          </section>
        )}

        {photosLast && photoSection}

        {photos.length === 0 && albums.length === 0 && users.length === 0 && cameras.length === 0 && films.length === 0 && (
          <EmptyState
            icon={
              <svg className="h-16 w-16" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            }
            message={`Nothing found for \u201c${q}\u201d`}
            hint="Check the spelling, try fewer words, or browse the catalog."
            // Inside the box: drawn under it with a negative margin, the row
            // sat on the dashed border.
            actions={
              <>
                <ButtonLink href="/films" variant="secondary" size="sm">Browse film stocks</ButtonLink>
                <ButtonLink href="/cameras" variant="secondary" size="sm">Browse cameras</ButtonLink>
                <ButtonLink href="/explore" variant="secondary" size="sm">Explore photos</ButtonLink>
              </>
            }
          />
        )}
      </main>

      <Footer />
    </div>
  )
}
