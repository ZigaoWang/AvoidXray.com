/**
 * Photos nobody else may see stay out of every surface that shows photos.
 *
 * Seeds one public photo and one of each kind that must stay hidden from
 * other people: private, an unfinished upload, held by the nudity check,
 * pending that check, rejected by it, and in the owner's trash. All share a
 * film, a camera and a caption with the public one, and are newer than it, so
 * any query that forgot a clause would meet them first. Two public albums
 * hold them, one with the public photo and one without.
 *
 * Then it runs the real query behind each surface, as a signed-out visitor, as
 * another account and as the owner, and checks each sees exactly what it
 * should: the public photo always; the owner's own private, held, pending and
 * rejected photos only for the owner and only where the owner's own view
 * includes them; the draft and the trashed photo nowhere.
 *
 * Needs a database, like archiveVisibility.test.ts, and the same guard.
 *
 *   DATABASE_URL=<throwaway> ALLOW_DB_TEST=1 npx tsx scripts/test/photoPrivacy.test.ts
 */
import { PrismaClient, type Prisma } from '@prisma/client'

function databaseName(): string | null {
  if (!process.env.DATABASE_URL) {
    try {
      process.loadEnvFile('.env')
    } catch {
      // No .env; the URL has to come from the environment.
    }
  }
  try {
    return decodeURIComponent(new URL(process.env.DATABASE_URL ?? '').pathname.slice(1)) || null
  } catch {
    return null
  }
}

const dbName = databaseName()
if (process.env.ALLOW_DB_TEST !== '1' && !/test|clone|trial/i.test(dbName ?? '')) {
  console.error(`Refusing to run against database "${dbName ?? '(unknown)'}". Point DATABASE_URL at a throwaway database or set ALLOW_DB_TEST=1.`)
  process.exit(1)
}

const prisma = new PrismaClient()
let pass = 0
let fail = 0

function check(name: string, ok: boolean, detail = '') {
  if (ok) { pass++; console.log(`  ok   ${name}`) }
  else { fail++; console.error(`  FAIL ${name} ${detail}`) }
}

const PREFIX = 'privacy_'
const CAPTION = 'privacy lighthouse in fog'
const MINUTE = 60 * 1000

/** Every state that must be hidden from other people, and how to make it. */
const HIDDEN = {
  private: { visibility: 'PRIVATE' },
  draft: { uploadComplete: false },
  held: { screening: 'HELD' },
  pending: { screening: 'PENDING' },
  rejected: { screening: 'REJECTED' },
  trashed: { deletedAt: new Date() },
} satisfies Record<string, Prisma.PhotoUncheckedCreateInput | Record<string, unknown>>

type State = keyof typeof HIDDEN

/** What the owner's own views include: their private and screened photos, never a draft or the trash. */
const OWNER_SEES: State[] = ['private', 'held', 'pending', 'rejected']

async function seed() {
  const [owner, stranger] = await Promise.all(['owner', 'stranger'].map(name => prisma.user.create({
    data: { id: `${PREFIX}${name}`, email: `${PREFIX}${name}@example.invalid`, username: `${PREFIX}${name}`, passwordHash: 'x' },
  })))
  const film = await prisma.filmStock.create({
    data: {
      id: `${PREFIX}film`, name: 'Privacy Chrome 100', slug: 'privacy-chrome-100', process: 'E6',
      chromaticity: 'COLOR', polarity: 'POSITIVE', brandId: 'brand_kodak', manufacturerStatus: 'SAME_AS_BRAND',
    },
  })
  const camera = await prisma.camera.create({ data: { id: `${PREFIX}camera`, name: 'Privacy Camera', slug: 'privacy-camera' } })
  // Every photo is developed by one lab and shot on one roll; a second roll
  // holds a private photo alone, so it has no public page. A photo in a roll
  // takes its film, camera and lab from the roll, so the rolls carry them.
  const lab = await prisma.lab.create({ data: { id: `${PREFIX}lab`, name: 'Privacy Lab', slug: 'privacy-lab' } })
  const gear = { ownerId: owner.id, filmStockId: film.id, cameraId: camera.id, labId: lab.id }
  const roll = await prisma.roll.create({ data: { id: `${PREFIX}roll`, ...gear } })
  // The other account's, so the owner's own counts below are unchanged.
  const hiddenRoll = await prisma.roll.create({ data: { id: `${PREFIX}roll_hidden`, ...gear, ownerId: stranger.id } })
  const base = (id: string, minutesAgo: number) => ({
    id: `${PREFIX}${id}`, userId: owner.id, createdAt: new Date(Date.now() - minutesAgo * MINUTE),
    originalPath: '/o', mediumPath: 'https://example.invalid/m.webp', thumbnailPath: 'https://example.invalid/t.webp',
    originalKey: `originals/${id}.jpg`, thumbKey: `thumbs/${id}.webp`, mediumKey: `medium/${id}.webp`,
    width: 3000, height: 2000, caption: CAPTION, filmStockId: film.id, cameraId: camera.id,
    labId: lab.id, rollId: roll.id,
    uploadComplete: true, visibility: 'PUBLIC' as const, screening: 'CLEAR' as const,
  })
  const shown = await prisma.photo.create({ data: base('public', 60) })
  const hidden = {} as Record<State, string>
  let minutes = 50
  for (const [state, data] of Object.entries(HIDDEN) as [State, Record<string, unknown>][]) {
    const photo = await prisma.photo.create({ data: { ...base(state, minutes--), ...data } as Prisma.PhotoUncheckedCreateInput })
    hidden[state] = photo.id
  }
  await prisma.photo.create({ data: { ...base('private_alone', 40), userId: stranger.id, rollId: hiddenRoll.id, visibility: 'PRIVATE' } })
  const allIds = [shown.id, ...Object.values(hidden)]
  const withPublic = await prisma.collection.create({
    data: { id: `${PREFIX}album`, name: 'Privacy album', public: true, userId: owner.id,
      photos: { create: allIds.map((photoId, order) => ({ photoId, order })) } },
  })
  const hiddenOnly = await prisma.collection.create({
    data: { id: `${PREFIX}album_hidden`, name: 'Privacy hidden album', public: true, userId: owner.id,
      photos: { create: Object.values(hidden).map((photoId, order) => ({ photoId, order })) } },
  })
  return { owner, stranger, film, camera, lab, roll, hiddenRoll, shown, hidden, withPublic, hiddenOnly }
}

async function cleanup() {
  await prisma.collection.deleteMany({ where: { id: { startsWith: PREFIX } } })
  await prisma.photo.deleteMany({ where: { id: { startsWith: PREFIX } } })
  await prisma.roll.deleteMany({ where: { id: { startsWith: PREFIX } } })
  await prisma.lab.deleteMany({ where: { id: { startsWith: PREFIX } } })
  await prisma.camera.deleteMany({ where: { id: { startsWith: PREFIX } } })
  await prisma.filmStock.deleteMany({ where: { id: { startsWith: PREFIX } } })
  await prisma.user.deleteMany({ where: { id: { startsWith: PREFIX } } })
}

async function main() {
  // Imported after the guard, so a refused run never opens a connection
  // through the app's own client.
  const { PUBLIC_PHOTO, visibleToViewer } = await import('../../src/lib/photoVisibility')
  const { feedWhere, albumPhotoPage, rollPhotoPage } = await import('../../src/lib/photoFeed')
  const { scopedFirstPage } = await import('../../src/lib/feedFirstPage')
  const { photoCountsByFilmStock, photoCountsByCamera, photoCountsByLab, photoCountsByRoll, latestPhotoByGear, visiblePhotoCountsByAlbum } = await import('../../src/lib/counts')
  const { getProfileFirstPage, getPhotoDays, getGearPreviews } = await import('../../src/lib/profileFeed')
  const { relatedPhotos, morePhotosByPhotographer, recentMix } = await import('../../src/lib/relatedPhotos')
  const { searchPhotos, parsePhotoSort } = await import('../../src/lib/photoSearch')
  const { previewPhotosByGear, VISIBLE_TO_ANYONE } = await import('../../src/lib/previewPhotos')
  const { getFilmCameraPairs } = await import('../../src/lib/seo/pairs')
  const { getAuthShowcase } = await import('../../src/lib/authShowcase')
  const { photoNeighbors } = await import('../../src/lib/photoNeighbors')
  const { albumsForPhoto } = await import('../../src/lib/photoAlbums')
  const { canReport } = await import('../../src/lib/reports')
  const { GET: hubsSitemap } = await import('../../src/app/sitemaps/hubs.xml/route')

  await cleanup()
  const s = await seed()
  const hiddenIds = Object.values(s.hidden)
  const ownerIds = OWNER_SEES.map(state => s.hidden[state])
  const neverIds = [s.hidden.draft, s.hidden.trashed]

  /** For a stranger or signed-out view: the public photo, and nothing hidden. */
  const strangerView = (name: string, ids: string[], expectShown = true) => {
    const leaked = hiddenIds.filter(id => ids.includes(id))
    check(name, (!expectShown || ids.includes(s.shown.id)) && leaked.length === 0,
      leaked.length ? `leaked ${leaked.map(id => id.slice(PREFIX.length)).join(', ')}` : 'public photo missing')
  }
  /** For the owner's own view: their visible states, never a draft or the trash. */
  const ownerView = (name: string, ids: string[]) => {
    const missing = ownerIds.filter(id => !ids.includes(id))
    const leaked = neverIds.filter(id => ids.includes(id))
    check(name, ids.includes(s.shown.id) && missing.length === 0 && leaked.length === 0,
      `${missing.length ? `missing ${missing.map(id => id.slice(PREFIX.length)).join(', ')} ` : ''}${leaked.length ? `leaked ${leaked.map(id => id.slice(PREFIX.length)).join(', ')}` : ''}`)
  }
  const idsOf = (rows: { id: string }[]) => rows.map(r => r.id)

  console.log('feeds')
  for (const tab of ['recent', 'popular'] as const) {
    strangerView(`${tab} feed, signed out`, idsOf(await prisma.photo.findMany({ where: feedWhere(tab, [], { filmStockId: s.film.id }), select: { id: true } })))
  }
  for (const order of ['random', 'recent', 'popular'] as const) {
    const { photos } = await scopedFirstPage({ scope: { filmStockId: s.film.id }, order, seed: 7, hidden: [] })
    strangerView(`${order} first page of the film hub`, idsOf(photos))
  }
  strangerView('feed as another account', idsOf(await prisma.photo.findMany({ where: feedWhere('recent', [], { filmStockId: s.film.id }, [], s.stranger.id), select: { id: true } })))
  strangerView('visibleToViewer for a stranger', idsOf(await prisma.photo.findMany({ where: { ...visibleToViewer(s.stranger.id), filmStockId: s.film.id }, select: { id: true } })))
  ownerView('visibleToViewer for the owner', idsOf(await prisma.photo.findMany({ where: { ...visibleToViewer(s.owner.id), filmStockId: s.film.id }, select: { id: true } })))

  console.log('counts and stats')
  check('film photo count is the public photo alone', (await photoCountsByFilmStock([s.film.id], PUBLIC_PHOTO)).get(s.film.id) === 1)
  check('camera photo count is the public photo alone', (await photoCountsByCamera([s.camera.id], PUBLIC_PHOTO)).get(s.camera.id) === 1)
  check('recently shot date comes from the public photo',
    (await latestPhotoByGear('filmStockId', [s.film.id], PUBLIC_PHOTO)).get(s.film.id)?.getTime() === s.shown.createdAt.getTime())
  const pair = (await getFilmCameraPairs(1)).find(p => p.filmSlug === s.film.slug && p.cameraSlug === s.camera.slug)
  check('film and camera pairing counts the public photo alone', pair?.count === 1, JSON.stringify(pair))
  check('album counts for a stranger are the public photo alone',
    (await visiblePhotoCountsByAlbum([s.withPublic.id], s.stranger.id)).get(s.withPublic.id) === 1)
  check('an album of hidden photos counts nothing for a stranger',
    ((await visiblePhotoCountsByAlbum([s.hiddenOnly.id], null)).get(s.hiddenOnly.id) ?? 0) === 0)
  check('album counts for the owner leave out drafts and the trash',
    (await visiblePhotoCountsByAlbum([s.withPublic.id], s.owner.id)).get(s.withPublic.id) === 1 + ownerIds.length)

  console.log('profiles')
  strangerView('profile grid, signed out', idsOf(await getProfileFirstPage(s.owner.id, 7, 50, null)))
  ownerView('profile grid, its owner', idsOf(await getProfileFirstPage(s.owner.id, 7, 50, s.owner.id)))
  check('profile activity counts one photo for a stranger', (await getPhotoDays(s.owner.id, null)).reduce((n, d) => n + d.count, 0) === 1)
  check('profile activity leaves out drafts and the trash for the owner',
    (await getPhotoDays(s.owner.id, s.owner.id)).reduce((n, d) => n + d.count, 0) === 1 + ownerIds.length)
  const gear = JSON.stringify(await getGearPreviews(s.owner.id, null))
  check('profile gear previews leave every hidden photo out', hiddenIds.every(id => !gear.includes(id)))

  console.log('the photo page')
  strangerView('related photos', idsOf(await relatedPhotos(s.shown, [])), false)
  strangerView('more by this photographer', idsOf(await morePhotosByPhotographer({ id: `${PREFIX}none`, userId: s.owner.id })))
  for (const viewer of [null, s.stranger.id]) {
    const neighbors = await photoNeighbors({ photo: s.shown, order: 'recent', seed: null, scope: { filmStockId: s.film.id }, hidden: [], owner: null, followingIds: [] })
    strangerView(`prev and next${viewer ? ' as another account' : ''}`, [s.shown.id, neighbors.prevId, neighbors.nextId].filter((x): x is string => !!x))
  }
  const strangerAlbums = await albumsForPhoto(s.shown.id, s.stranger.id)
  check('albums holding the photo show a stranger the public count', strangerAlbums.every(a => !JSON.stringify(a).includes(s.hidden.private)))

  console.log('albums')
  strangerView('a public album, signed out', (await albumPhotoPage(s.withPublic.id, visibleToViewer(null), { take: 50 })).map(r => r.id))
  strangerView('a public album, another account', (await albumPhotoPage(s.withPublic.id, visibleToViewer(s.stranger.id), { take: 50 })).map(r => r.id))
  ownerView('the owner\'s own album', (await albumPhotoPage(s.withPublic.id, visibleToViewer(s.owner.id), { take: 50 })).map(r => r.id))

  console.log('labs and rolls')
  for (const scope of [{ labId: s.lab.id }, { rollId: s.roll.id }]) {
    const name = 'labId' in scope ? 'lab' : 'roll'
    strangerView(`${name} feed, signed out`, idsOf(await prisma.photo.findMany({ where: feedWhere('recent', [], scope), select: { id: true } })))
    for (const order of ['random', 'recent'] as const) {
      strangerView(`${order} first page of the ${name}`, idsOf((await scopedFirstPage({ scope, order, seed: 7, hidden: [] })).photos))
    }
    const neighbors = await photoNeighbors({ photo: s.shown, order: 'recent', seed: null, scope, hidden: [], owner: null, followingIds: [] })
    strangerView(`prev and next through the ${name}`, [s.shown.id, neighbors.prevId, neighbors.nextId].filter((x): x is string => !!x))
  }
  strangerView('a roll\'s page', idsOf(await rollPhotoPage(feedWhere('recent', [], { rollId: s.roll.id }), { take: 50 })))
  check('lab photo count is the public photo alone', (await photoCountsByLab([s.lab.id], PUBLIC_PHOTO)).get(s.lab.id) === 1)
  check('roll photo count is the public photo alone', (await photoCountsByRoll([s.roll.id], PUBLIC_PHOTO)).get(s.roll.id) === 1)
  check('a roll of a private photo counts nothing', ((await photoCountsByRoll([s.hiddenRoll.id], PUBLIC_PHOTO)).get(s.hiddenRoll.id) ?? 0) === 0)
  strangerView('lab card previews', idsOf(await previewPhotosByGear({ key: 'labId', parents: [s.lab.id], where: VISIBLE_TO_ANYONE, order: 'random' })))
  strangerView('roll card previews', idsOf(await previewPhotosByGear({ key: 'rollId', parents: [s.roll.id], where: VISIBLE_TO_ANYONE, order: 'roll' })))

  console.log('search')
  for (const viewerId of [null, s.stranger.id]) {
    const search = await searchPhotos({
      query: CAPTION, contentIds: [...hiddenIds, s.shown.id], gear: { filmIds: [s.film.id], cameraIds: [s.camera.id] },
      scope: {}, sort: parsePhotoSort(undefined), viewerId, hidden: [], skip: 0, take: 50,
    })
    strangerView(`caption, look-alike and gear matches${viewerId ? ' as another account' : ', signed out'}`, search.ids)
  }

  console.log('recent and showcase')
  strangerView('recent mix', idsOf(await recentMix({ hidden: [], take: 500 })))
  strangerView('sign-in showcase', idsOf((await getAuthShowcase()).photos), false)
  strangerView('gear card previews', idsOf(await previewPhotosByGear({ key: 'filmStockId', parents: [s.film.id], where: VISIBLE_TO_ANYONE, order: 'recent' })))

  console.log('sitemaps')
  const hubs = await (await hubsSitemap()).text()
  check('the hub sitemap lists the album with a public photo', hubs.includes(s.withPublic.id))
  check('the hub sitemap leaves out an album of hidden photos', !hubs.includes(s.hiddenOnly.id))
  check('the hub sitemap lists the lab and the roll with a public photo', hubs.includes('/labs/privacy-lab') && hubs.includes(`/rolls/${s.roll.id}`))
  check('the hub sitemap leaves out a roll of a private photo', !hubs.includes(s.hiddenRoll.id))

  console.log('reports')
  check('a visible photo can be reported', await canReport('photo', s.shown.id, s.stranger.id))
  const reportable = await Promise.all(hiddenIds.map(id => canReport('photo', id, s.stranger.id)))
  check('a hidden photo answers like one that does not exist', reportable.every(ok => !ok)
    && !(await canReport('photo', `${PREFIX}missing`, s.stranger.id)))
}

main()
  .catch(error => {
    fail++
    console.error(error)
  })
  .finally(async () => {
    await cleanup().catch(error => console.error('cleanup failed', error))
    await prisma.$disconnect()
    console.log(`\n${pass} passed, ${fail} failed`)
    process.exit(fail > 0 ? 1 : 0)
  })
