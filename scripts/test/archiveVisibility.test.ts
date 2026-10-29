/**
 * Archive photos stay out of everything that represents community activity.
 *
 * Seeds one community photo and one archive photo with the same film, camera
 * and caption, the archive one newer so that any query ordering by date would
 * meet it first, then runs the real queries behind each
 * community surface and checks the archive photo is never among the results.
 * Needs a database, for the same reason revisionPipeline.test.ts does: the
 * rule lives in Prisma filters and raw SQL, and only a real database runs both.
 *
 *   DATABASE_URL=<throwaway> npx tsx scripts/test/archiveVisibility.test.ts
 *
 * Refuses to run unless the database name contains "test", "clone" or "trial",
 * or ALLOW_DB_TEST=1 is set. Everything it creates is removed at the end.
 */
import { PrismaClient } from '@prisma/client'

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

const PREFIX = 'archvis_'
const CAPTION = 'archvis harbor at dusk'
const DAY = 24 * 60 * 60 * 1000

async function seed() {
  const user = await prisma.user.create({
    data: { id: `${PREFIX}user`, email: `${PREFIX}user@example.invalid`, username: `${PREFIX}user`, passwordHash: 'x' },
  })
  const film = await prisma.filmStock.create({
    data: {
      id: `${PREFIX}film`, name: 'Archvis Chrome 64', slug: 'archvis-chrome-64', process: 'E6',
      chromaticity: 'COLOR', polarity: 'POSITIVE', brandId: 'brand_kodak', manufacturerStatus: 'SAME_AS_BRAND',
    },
  })
  const camera = await prisma.camera.create({ data: { id: `${PREFIX}camera`, name: 'Archvis Camera', slug: 'archvis-camera' } })
  const common = {
    originalPath: 'https://example.invalid/o.jpg', mediumPath: 'https://example.invalid/m.webp',
    thumbnailPath: 'https://example.invalid/t.webp', thumbKey: 't.webp', mediumKey: 'm.webp', width: 3000, height: 2000, caption: CAPTION,
    filmStockId: film.id, cameraId: camera.id, uploadComplete: true, visibility: 'PUBLIC' as const, screening: 'CLEAR' as const,
  }
  const community = await prisma.photo.create({
    data: { ...common, id: `${PREFIX}community`, userId: user.id, originalKey: 'o.jpg', createdAt: new Date(Date.now() - 2 * DAY) },
  })
  const archive = await prisma.photo.create({
    data: { ...common, id: `${PREFIX}archive`, kind: 'ARCHIVE', createdAt: new Date(Date.now() - DAY) },
  })
  return { user, film, camera, community, archive }
}

async function cleanup() {
  await prisma.photo.deleteMany({ where: { id: { startsWith: PREFIX } } })
  await prisma.camera.deleteMany({ where: { id: { startsWith: PREFIX } } })
  await prisma.filmStock.deleteMany({ where: { id: { startsWith: PREFIX } } })
  await prisma.user.deleteMany({ where: { id: { startsWith: PREFIX } } })
}

async function main() {
  // Imported after the guard, so a refused run never opens a connection
  // through the app's own client.
  const { PUBLIC_PHOTO, COMMUNITY_PHOTO, visibleToViewer, canViewPhoto, canOpenPhotoPage } = await import('../../src/lib/photoVisibility')
  const { feedWhere } = await import('../../src/lib/photoFeed')
  const { scopedFirstPage } = await import('../../src/lib/feedFirstPage')
  const { photoCountsByFilmStock, photoCountsByCamera, latestPhotoByGear } = await import('../../src/lib/counts')
  const { getProfileFirstPage, getPhotoDays, getGearPreviews } = await import('../../src/lib/profileFeed')
  const { recentMix } = await import('../../src/lib/relatedPhotos')
  const { searchPhotos, parsePhotoSort } = await import('../../src/lib/photoSearch')
  const { previewPhotosByGear, VISIBLE_TO_ANYONE } = await import('../../src/lib/previewPhotos')
  const { getFilmCameraPairs } = await import('../../src/lib/seo/pairs')
  const { getAuthShowcase } = await import('../../src/lib/authShowcase')
  const { photoNeighbors } = await import('../../src/lib/photoNeighbors')

  await cleanup()
  const { user, film, camera, community, archive } = await seed()
  const lacksArchive = (ids: string[]) => !ids.includes(archive.id)

  console.log('single-photo rules')
  check('an archive photo cannot be liked, commented on or exported', !canViewPhoto(archive, null) && !canViewPhoto(archive, user.id))
  check('a published archive photo has a page anyone can open', canOpenPhotoPage(archive, null))

  console.log('main feed')
  for (const tab of ['recent', 'popular'] as const) {
    const rows = await prisma.photo.findMany({ where: feedWhere(tab, [], { filmStockId: film.id }), select: { id: true } })
    check(`${tab} feed shows the community photo and not the archive one`,
      rows.some(r => r.id === community.id) && lacksArchive(rows.map(r => r.id)))
  }
  for (const order of ['random', 'recent', 'popular'] as const) {
    const { photos } = await scopedFirstPage({ scope: { filmStockId: film.id }, order, seed: 7, hidden: [] })
    check(`${order} first page of a hub grid leaves it out`, lacksArchive(photos.map(p => p.id)))
  }
  const ownFeed = await prisma.photo.findMany({ where: feedWhere('recent', [], {}, [], user.id), select: { id: true } })
  check('an owner viewing their own feed does not get it either', lacksArchive(ownFeed.map(r => r.id)))
  const viewer = await prisma.photo.findMany({ where: { ...visibleToViewer(user.id), filmStockId: film.id }, select: { id: true } })
  check('visibleToViewer leaves it out', lacksArchive(viewer.map(r => r.id)))

  console.log('counts and stats')
  check('film photo count is the community photo alone',
    (await photoCountsByFilmStock([film.id], PUBLIC_PHOTO)).get(film.id) === 1)
  check('camera photo count is the community photo alone',
    (await photoCountsByCamera([camera.id], PUBLIC_PHOTO)).get(camera.id) === 1)
  check('recently shot date comes from the community photo',
    (await latestPhotoByGear('filmStockId', [film.id], PUBLIC_PHOTO)).get(film.id)?.getTime() === community.createdAt.getTime())
  check('community count for the dashboard leaves it out',
    (await prisma.photo.count({ where: { ...COMMUNITY_PHOTO, filmStockId: film.id } })) === 1)
  const pairs = await getFilmCameraPairs(1)
  const pair = pairs.find(p => p.filmSlug === film.slug && p.cameraSlug === camera.slug)
  check('film and camera pairing counts the community photo alone',
    pair?.count === 1 && pair.newestAt.getTime() === community.createdAt.getTime(), JSON.stringify(pair))

  console.log('profiles')
  const profile = await getProfileFirstPage(user.id, 7, 50, null)
  check('profile grid has the community photo only', profile.length === 1 && profile[0].id === community.id)
  const days = await getPhotoDays(user.id, null)
  check('profile activity counts one photo', days.reduce((sum, d) => sum + d.count, 0) === 1)
  const gear = await getGearPreviews(user.id, null)
  check('profile gear previews leave it out', !JSON.stringify(gear).includes(archive.id))

  console.log('leaderboards')
  const top = await prisma.photo.groupBy({ by: ['userId'], where: { ...PUBLIC_PHOTO, filmStockId: film.id }, _count: { _all: true } })
  check('photographers ranked by photos have no ownerless entry', top.every(t => t.userId !== null) && top.length === 1)

  console.log('recent uploads')
  const recent = await recentMix({ hidden: [], take: 200 })
  check('recent mix leaves it out', lacksArchive(recent.map(p => p.id)))
  const showcase = await getAuthShowcase()
  check('sign-in showcase leaves it out', lacksArchive(showcase.photos.map(p => p.id)))
  const previews = await previewPhotosByGear({ key: 'filmStockId', parents: [film.id], where: VISIBLE_TO_ANYONE, order: 'recent' })
  check('gear card previews leave it out', previews.length === 1 && lacksArchive(previews.map(p => p.id)))
  const neighbors = await photoNeighbors({ photo: community, order: 'recent', seed: null, scope: { filmStockId: film.id }, hidden: [], owner: null, followingIds: [] })
  check('prev and next never step onto it', neighbors.prevId !== archive.id && neighbors.nextId !== archive.id)

  console.log('community search')
  const search = await searchPhotos({
    query: CAPTION, contentIds: [archive.id, community.id], gear: { filmIds: [film.id], cameraIds: [camera.id] },
    scope: {}, sort: parsePhotoSort(undefined), viewerId: null, hidden: [], skip: 0, take: 50,
  })
  check('caption, look-alike and gear matches leave it out', search.ids.includes(community.id) && lacksArchive(search.ids))
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
