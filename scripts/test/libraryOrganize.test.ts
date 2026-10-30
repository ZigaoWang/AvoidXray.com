/**
 * Organizing the library, against a real database: moving photos between
 * rolls, splitting and merging, frame order, loose photos, bulk details, the
 * filters and word search, and the Trash from delete to purge.
 *
 * Files live in the local stand-in for the bucket (LOCAL_UPLOADS) and a
 * scratch media mirror, so a purge can be seen removing both.
 *
 *   DATABASE_URL=<throwaway> ALLOW_DB_TEST=1 npx tsx scripts/test/libraryOrganize.test.ts
 */
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { PrismaClient } from '@prisma/client'

process.env.LOCAL_UPLOADS = '1'
process.env.VISION_URL = 'http://127.0.0.1:9'

function databaseName(): string | null {
  if (!process.env.DATABASE_URL) {
    try { process.loadEnvFile('.env') } catch { /* no .env */ }
  }
  try { return decodeURIComponent(new URL(process.env.DATABASE_URL ?? '').pathname.slice(1)) || null } catch { return null }
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

const P = 'liborg_'
const UPLOADS = path.join(process.cwd(), 'public', 'local-uploads')

async function main() {
  const mirror = await mkdtemp(path.join(tmpdir(), 'liborg-mirror-'))
  process.env.MEDIA_ROOT = mirror
  const { movePhotos, mergeRolls, reorderRoll, leaveRollsForGear } = await import('../../src/lib/library/rollActions')
  const { applyPhotoDetails } = await import('../../src/lib/library/photoDetails')
  const { rollPage, loosePage, libraryFacets } = await import('../../src/lib/library/browse')
  const { searchLibrary } = await import('../../src/lib/library/search')
  const { trashPhotos, restorePhotos, purgeTrashed, purgeExpiredTrash } = await import('../../src/lib/library/trash')
  const { syncStorageAfterVisibilityChange } = await import('../../src/lib/photoStorage')

  const cleanup = async () => {
    await prisma.photo.deleteMany({ where: { userId: { startsWith: P } } })
    await prisma.roll.deleteMany({ where: { ownerId: { startsWith: P } } })
    await prisma.user.deleteMany({ where: { id: { startsWith: P } } })
    await prisma.camera.deleteMany({ where: { id: { startsWith: P } } })
    await prisma.filmStock.deleteMany({ where: { id: { startsWith: P } } })
    await rm(path.join(UPLOADS, 'liborg'), { recursive: true, force: true })
  }

  try {
    await cleanup()
    const owner = (await prisma.user.create({ data: { id: `${P}owner`, email: `${P}o@example.invalid`, username: `${P}owner`, passwordHash: 'x' } })).id
    const other = (await prisma.user.create({ data: { id: `${P}other`, email: `${P}x@example.invalid`, username: `${P}other`, passwordHash: 'x' } })).id
    const film = await prisma.filmStock.create({ data: { id: `${P}film`, name: 'Liborg Gold 200', slug: 'liborg-gold-200', process: 'C41', chromaticity: 'COLOR', polarity: 'NEGATIVE', brandId: 'brand_kodak', manufacturerStatus: 'SAME_AS_BRAND' } })
    const camera = await prisma.camera.create({ data: { id: `${P}camera`, name: 'Liborg FM2', slug: 'liborg-fm2' } })
    const rollA = await prisma.roll.create({ data: { ownerId: owner, title: 'Harbour', filmStockId: film.id, cameraId: camera.id, location: 'Victoria Harbour', shotFrom: new Date('2025-06-01'), shotFromPrecision: 'MONTH' } })
    const rollB = await prisma.roll.create({ data: { ownerId: owner, title: 'Market' } })
    const strangers = await prisma.roll.create({ data: { ownerId: other } })

    const makePhoto = async (n: number, extra: Record<string, unknown>) => {
      const id = `${P}p${n}`
      const keys = { thumbKey: `liborg/thumbs/${id}.webp`, mediumKey: `liborg/medium/${id}.webp`, largeKey: `liborg/large/${id}.jpg`, originalKey: `liborg/originals/${id}.jpg` }
      for (const key of Object.values(keys)) {
        await mkdir(path.dirname(path.join(UPLOADS, key)), { recursive: true })
        await writeFile(path.join(UPLOADS, key), 'x')
      }
      await prisma.photo.create({
        data: {
          id, userId: owner, ...keys, thumbnailPath: `/local-uploads/${keys.thumbKey}`, mediumPath: `/local-uploads/${keys.mediumKey}`,
          originalPath: `/api/photos/${id}/image/original`, width: 300, height: 200, uploadComplete: true, visibility: 'PUBLIC',
          screening: 'CLEAR', imagesPublic: true, createdAt: new Date(Date.UTC(2025, 6, 1, 0, n)), ...extra,
        },
      })
      return id
    }
    const a = [1, 2, 3, 4, 5].map(n => makePhoto(n, { rollId: rollA.id, rollPosition: n }))
    const aIds = await Promise.all(a)
    const bIds = await Promise.all([6, 7].map(n => makePhoto(n, { rollId: rollB.id, rollPosition: n - 5, caption: 'tram at the corner' })))
    const looseId = await makePhoto(8, { visibility: 'PRIVATE', imagesPublic: false })
    const order = async (rollId: string) => (await prisma.photo.findMany({ where: { rollId }, orderBy: { rollPosition: 'asc' }, select: { id: true } })).map(p => p.id)

    console.log('rolls')
    const page = await rollPage(owner, {}, 0)
    check('the home lists the owner\'s rolls with their header details',
      page.rolls.length === 2 && page.rolls.some(r => r.title === 'Harbour' && r.filmStock === 'Liborg Gold 200' && r.shotFrom === '2025-06'))
    check('counts say how many photos and how many published', page.rolls.find(r => r.id === rollA.id)?.photoCount === 5 && page.rolls.find(r => r.id === rollA.id)?.publishedCount === 5)
    check('loose photos are their own section', (await loosePage(owner, {}, 0)).photos.map(p => p.id).join() === looseId)
    check('a film filter keeps only that film', (await rollPage(owner, { filmStockId: film.id }, 0)).rolls.map(r => r.id).join() === rollA.id)
    check('the year shot comes from the roll', (await rollPage(owner, { year: 2025 }, 0)).rolls.map(r => r.id).join() === rollA.id)
    check('undated keeps the roll and loose photos with no date', (await rollPage(owner, { year: 'undated' }, 0)).rolls.map(r => r.id).join() === rollB.id
      && (await loosePage(owner, { year: 'undated' }, 0)).photos.length === 1)
    check('the year filter offers undated only when something is', (await libraryFacets(owner)).undated === true)
    check('private keeps the private loose photo only', (await rollPage(owner, { status: 'private' }, 0)).rolls.length === 0
      && (await loosePage(owner, { status: 'private' }, 0)).photos.length === 1)
    const words = await searchLibrary(owner, 'tram')
    check('word search finds by caption', words.ids.sort().join() === [...bIds].sort().join())
    check('word search finds by the roll\'s location', (await searchLibrary(owner, 'harbour')).ids.length === 5)
    check('without the vision worker the search says so', words.contentSearched === false)

    console.log('moving')
    const newRoll = await movePhotos(owner, [aIds[3], aIds[4]], { newRoll: { title: null, copyFrom: rollA.id } })
    const split = await prisma.roll.findUniqueOrThrow({ where: { id: newRoll! } })
    check('a split makes a roll with the source\'s details', split.filmStockId === film.id && split.location === 'Victoria Harbour')
    check('the split frames are numbered from 1', (await order(newRoll!)).join() === [aIds[3], aIds[4]].join())
    await mergeRolls(owner, newRoll!, rollA.id)
    check('merging appends after the last frame', (await order(rollA.id)).join() === aIds.join())
    check('merging deletes the emptied roll', !(await prisma.roll.findUnique({ where: { id: newRoll! } })))
    await movePhotos(owner, [bIds[0]], { rollId: rollA.id })
    const moved = await prisma.photo.findUniqueOrThrow({ where: { id: bIds[0] } })
    check('a photo moved into a roll takes its details', moved.filmStockId === film.id && moved.cameraId === camera.id && moved.rollPosition === 6)
    let refused = false
    try { await movePhotos(owner, [aIds[0]], { rollId: strangers.id }) } catch { refused = true }
    check('a photo cannot go into another owner\'s roll', refused)
    await movePhotos(owner, [bIds[0]], { loose: true })
    const loose = await prisma.photo.findUniqueOrThrow({ where: { id: bIds[0] } })
    check('making a photo loose keeps its details', loose.rollId === null && loose.rollPosition === null && loose.filmStockId === film.id)
    await reorderRoll(owner, rollA.id, [aIds[4], aIds[0]])
    check('reordering numbers the named frames first', (await order(rollA.id)).join() === [aIds[4], aIds[0], aIds[1], aIds[2], aIds[3]].join())

    console.log('details')
    const result = await applyPhotoDetails(owner, [aIds[0], bIds[0]], { cameraId: null, caption: 'night' })
    check('bulk details skip film, camera and lab on photos in rolls', 'keptByRoll' in result && result.keptByRoll === 1)
    const [inRoll, out] = await Promise.all([prisma.photo.findUniqueOrThrow({ where: { id: aIds[0] } }), prisma.photo.findUniqueOrThrow({ where: { id: bIds[0] } })])
    check('the caption lands on both, the camera only on the loose one', inRoll.caption === 'night' && out.caption === 'night' && inRoll.cameraId === camera.id && out.cameraId === null)
    const strangersEdit = await applyPhotoDetails(other, [aIds[0]], { caption: 'stolen' })
    check('another account cannot edit them', 'updated' in strangersEdit && strangersEdit.updated === 0)

    console.log('gear from the photo edit page and Your photos')
    const otherCamera = await prisma.camera.create({ data: { id: `${P}camera2`, name: 'Liborg XA', slug: 'liborg-xa' } })
    const refusedGear = await prisma.photo.update({ where: { id: aIds[3] }, data: { cameraId: otherCamera.id } }).then(() => false, () => true)
    check('the database refuses other gear on a photo in a roll', refusedGear)
    await leaveRollsForGear(owner, [aIds[3], aIds[4]], { cameraId: camera.id })
    check('the roll\'s own camera keeps photos in it', (await order(rollA.id)).includes(aIds[3]))
    await leaveRollsForGear(owner, [aIds[3]], { cameraId: otherCamera.id })
    await prisma.photo.update({ where: { id: aIds[3] }, data: { cameraId: otherCamera.id } })
    const leftRoll = await prisma.photo.findUniqueOrThrow({ where: { id: aIds[3] } })
    check('another camera takes the photo out of its roll, then saves', leftRoll.rollId === null && leftRoll.cameraId === otherCamera.id)
    check('the rest of the roll stays', (await order(rollA.id)).includes(aIds[4]))

    console.log('trash')
    check('trashing moves the owner\'s photos only', (await trashPhotos(other, [aIds[1]])) === 0 && (await trashPhotos(owner, [aIds[1], aIds[2]])) === 2)
    await syncStorageAfterVisibilityChange([aIds[1], aIds[2]])
    const trashed = await prisma.photo.findUniqueOrThrow({ where: { id: aIds[1] } })
    check('a trashed photo\'s files go private, at new keys', !trashed.imagesPublic && !trashed.thumbKey.includes(aIds[1]))
    check('it leaves the library listings', !(await rollPage(owner, {}, 0)).rolls.flatMap(r => r.photos).some(p => p.id === aIds[1]))
    await restorePhotos(owner, [aIds[1]])
    await syncStorageAfterVisibilityChange([aIds[1]])
    const restored = await prisma.photo.findUniqueOrThrow({ where: { id: aIds[1] } })
    check('restoring puts it back in its roll, public again', restored.deletedAt === null && restored.rollId === rollA.id && restored.imagesPublic)

    const doomed = await prisma.photo.findUniqueOrThrow({ where: { id: aIds[2] } })
    const keys = [doomed.originalKey!, doomed.thumbKey, doomed.mediumKey, doomed.largeKey!]
    for (const key of keys) { await mkdir(path.dirname(path.join(mirror, key)), { recursive: true }); await writeFile(path.join(mirror, key), 'm') }
    check('purging needs the photo to be in the Trash', (await purgeTrashed({ ownerId: owner, ids: [aIds[0]] })) === 0)
    check('purging deletes the row', (await purgeTrashed({ ownerId: owner, ids: [aIds[2]] })) === 1 && !(await prisma.photo.findUnique({ where: { id: aIds[2] } })))
    check('and every stored file', keys.every(k => !existsSync(path.join(UPLOADS, k))))
    check('and the mirror\'s copies', keys.every(k => !existsSync(path.join(mirror, k))))

    await trashPhotos(owner, [aIds[3]])
    await prisma.photo.update({ where: { id: aIds[3] }, data: { deletedAt: new Date(Date.now() - 31 * 86400000) } })
    await trashPhotos(owner, [aIds[4]])
    await purgeExpiredTrash()
    check('the hourly purge takes what is 30 days in the Trash', !(await prisma.photo.findUnique({ where: { id: aIds[3] } })))
    check('and leaves what is not', !!(await prisma.photo.findUnique({ where: { id: aIds[4] } })))

    await movePhotos(owner, bIds.slice(1), { rollId: rollA.id })
    await trashPhotos(owner, (await order(rollA.id)))
    await purgeTrashed({ ownerId: owner })
    check('purging a roll\'s last photo removes the roll', !(await prisma.roll.findUnique({ where: { id: rollA.id } })))
  } finally {
    await cleanup().catch(error => console.error('cleanup failed:', error))
    await rm(mirror, { recursive: true, force: true })
    await prisma.$disconnect()
  }
}

main()
  .catch(error => { fail++; console.error(error) })
  .finally(() => {
    console.log(`\n${pass} passed, ${fail} failed`)
    process.exit(fail > 0 ? 1 : 0)
  })
