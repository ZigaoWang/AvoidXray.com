/**
 * Export of original files, against a real database: what each kind of
 * export covers (only the owner's photos, never the Trash or someone else's),
 * the limits on queuing them, and a build end to end into zip parts that the
 * system's own unzip and Python's zipfile both read back byte for byte.
 *
 * Files live in a scratch folder standing in for the bucket.
 *
 *   DATABASE_URL=<throwaway> ALLOW_DB_TEST=1 npx tsx scripts/test/libraryExport.test.ts
 */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readdirSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { PrismaClient } from '@prisma/client'

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

const P = 'libexp_'
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex')

async function main() {
  const root = await mkdtemp(path.join(tmpdir(), 'libexp-bucket-'))
  const out = await mkdtemp(path.join(tmpdir(), 'libexp-out-'))
  const { resolveExport, exportEntries, exportLimit, planParts, zipsInBrowser } = await import('../../src/lib/library/exports')
  const { buildExport } = await import('../../src/lib/library/exportBuild')
  const { localExportStorage } = await import('../../src/lib/library/exportStorage')
  const storage = localExportStorage(root)

  const cleanup = async () => {
    await prisma.libraryExport.deleteMany({ where: { userId: { startsWith: P } } })
    await prisma.collection.deleteMany({ where: { userId: { startsWith: P } } })
    await prisma.photo.deleteMany({ where: { userId: { startsWith: P } } })
    await prisma.roll.deleteMany({ where: { ownerId: { startsWith: P } } })
    await prisma.user.deleteMany({ where: { id: { startsWith: P } } })
  }

  try {
    await cleanup()
    const owner = (await prisma.user.create({ data: { id: `${P}owner`, email: `${P}o@example.invalid`, username: `${P}owner`, passwordHash: 'x' } })).id
    const other = (await prisma.user.create({ data: { id: `${P}other`, email: `${P}x@example.invalid`, username: `${P}other`, passwordHash: 'x' } })).id
    const harbour = await prisma.roll.create({ data: { ownerId: owner, title: 'Harbour', location: 'Victoria Harbour', notes: 'pushed, "one stop"', shotFrom: new Date('2025-06-12'), shotFromPrecision: 'DAY' } })
    const untitled = await prisma.roll.create({ data: { ownerId: owner, shotFrom: new Date('2024-03-01'), shotFromPrecision: 'MONTH' } })
    const theirs = await prisma.roll.create({ data: { ownerId: other, title: 'Theirs' } })

    const originals = new Map<string, Buffer>()
    let n = 0
    const makePhoto = async (userId: string, extra: Record<string, unknown>, opts: { filename?: string; storeAs?: Buffer | null; size?: number } = {}) => {
      const id = `${P}p${++n}`
      // Different sizes and contents, some larger than one read chunk.
      const bytes = Buffer.alloc(opts.size ?? 1000 + n * 70_001, n)
      bytes.write(`original ${id}`)
      const originalKey = `originals/${id}.tif`
      const stored = opts.storeAs === undefined ? bytes : opts.storeAs
      if (stored) {
        await mkdir(path.join(root, 'originals'), { recursive: true })
        await writeFile(path.join(root, originalKey), stored)
      }
      originals.set(id, bytes)
      await prisma.photo.create({
        data: {
          id, userId, originalKey, thumbKey: `thumbs/${id}.webp`, mediumKey: `medium/${id}.webp`,
          thumbnailPath: `/x/${id}`, mediumPath: `/x/${id}`, originalPath: `/api/photos/${id}/image/original`,
          width: 300, height: 200, uploadComplete: true, visibility: 'PRIVATE', screening: 'CLEAR',
          originalBytes: bytes.length, originalSha256: sha(bytes), originalFilename: opts.filename ?? `scan-${n}.tif`,
          createdAt: new Date(Date.UTC(2025, 6, 1, 0, n)), ...extra,
        },
      })
      return id
    }
    const h1 = await makePhoto(owner, { rollId: harbour.id, rollPosition: 2, caption: 'ferry, at dusk' }, { filename: 'Scan 01.tif', size: 1_500_001 })
    const h2 = await makePhoto(owner, { rollId: harbour.id, rollPosition: 1, visibility: 'PUBLIC' }, { filename: 'scan 01.TIF', size: 1_500_002 })
    const u1 = await makePhoto(owner, { rollId: untitled.id, rollPosition: 1 }, { filename: '港口.tif', size: 1_500_003 })
    const loose = await makePhoto(owner, {})
    const trashed = await makePhoto(owner, { deletedAt: new Date() })
    const strangers = await makePhoto(other, { rollId: theirs.id, rollPosition: 1 })
    const album = await prisma.collection.create({ data: { userId: owner, name: 'Best of', photos: { create: [{ photoId: h1 }, { photoId: strangers }, { photoId: loose }] } } })
    const theirAlbum = await prisma.collection.create({ data: { userId: other, name: 'Theirs', photos: { create: [{ photoId: strangers }] } } })

    console.log('what an export covers')
    const library = (await resolveExport(owner, { scope: 'library' }))!
    check('the whole library is the owner\'s photos, Trash left out, rolls in shot order then loose',
      library.photoIds.join() === [u1, h2, h1, loose].join(), library.photoIds.join())
    check('its size is the sum of the originals', library.bytes === [u1, h2, h1, loose].reduce((s, id) => s + originals.get(id)!.length, 0))
    const roll = (await resolveExport(owner, { scope: 'roll', rollId: harbour.id }))!
    check('a roll is its frames in order, named for its title', roll.photoIds.join() === [h2, h1].join() && roll.title === 'Harbour')
    check('someone else\'s roll answers as if it did not exist', (await resolveExport(owner, { scope: 'roll', rollId: theirs.id })) === null)
    const inAlbum = (await resolveExport(owner, { scope: 'album', albumId: album.id }))!
    check('an album exports only the owner\'s photos in it, and counts the others left out',
      inAlbum.photoIds.length === 2 && !inAlbum.photoIds.includes(strangers) && inAlbum.othersLeftOut === 1)
    check('someone else\'s album answers as if it did not exist', (await resolveExport(owner, { scope: 'album', albumId: theirAlbum.id })) === null)
    const picked = (await resolveExport(owner, { scope: 'selection', photoIds: [strangers, h1, trashed, 'nope'] }))!
    check('a selection keeps only the owner\'s photos outside the Trash', picked.photoIds.join() === h1)
    check('a small export is zipped in the browser', zipsInBrowser(roll))
    check('so is nothing else past its bounds', !zipsInBrowser({ photoIds: Array(61).fill('x'), bytes: 1 }) && !zipsInBrowser({ photoIds: ['x'], bytes: 500 * 1024 * 1024 }))

    console.log('names and details')
    const entries = await exportEntries(owner, library.photoIds)
    const paths = entries.map(e => e.path)
    check('one folder per roll, dated and titled, loose photos in their own',
      paths[1].startsWith('2025-06-12 Harbour/') && paths[3].startsWith('Loose photos/'), paths.join(' | '))
    check('a roll with no title is named for its date', paths[0].startsWith('2024-03/'), paths[0])
    check('file names as uploaded, made distinct without case', paths[1] === '2025-06-12 Harbour/scan 01.TIF' && paths[2] === '2025-06-12 Harbour/Scan 01-2.tif', `${paths[1]} ${paths[2]}`)
    check('a name with nothing readable in ASCII falls back to the frame, zero-padded', paths[0] === '2024-03/01.tif', paths[0])
    // An account of its own, so the photos above keep their order and counts.
    const unnamed = (await prisma.user.create({ data: { id: `${P}unnamed`, email: `${P}u@example.invalid`, username: `${P}unnamed`, passwordHash: 'x' } })).id
    const dock = await prisma.roll.create({ data: { ownerId: unnamed, title: 'Dock', shotFrom: new Date('2025-06-12'), shotFromPrecision: 'DAY' } })
    const nameless1 = await makePhoto(unnamed, { rollId: dock.id, rollPosition: 7, originalFilename: null }, { size: 10 })
    const nameless2 = await makePhoto(unnamed, { rollId: dock.id, rollPosition: 12, originalFilename: null }, { size: 10 })
    const nameless3 = await makePhoto(unnamed, { takenDate: new Date('2025-05-04'), originalFilename: null }, { size: 10 })
    const nameless4 = await makePhoto(unnamed, { originalFilename: null }, { size: 10 })
    const named = await exportEntries(unnamed, [nameless1, nameless2, nameless3, nameless4])
    check('a roll photo with no recorded name is named for its frame', named[0].path === '2025-06-12 Dock/07.tif' && named[1].path === '2025-06-12 Dock/12.tif', named.map(e => e.path).join(' | '))
    check('a loose photo with no recorded name is its shot date and a short id, never the bare id',
      named[2].path === `Loose photos/2025-05-04 ${nameless3.replace(/[^a-z0-9]/gi, '').slice(-6)}.tif`, named[2].path)
    check('or, with no shot date, the day it was uploaded', named[3].path === `Loose photos/2025-07-01 ${nameless4.replace(/[^a-z0-9]/gi, '').slice(-6)}.tif`, named[3].path)
    check('details carry the roll\'s private notes and location, for the owner', entries[2].details.roll?.location === 'Victoria Harbour' && entries[2].details.roll?.frame === 2)
    check('a published photo links its page, a private one does not', entries[1].details.pageUrl?.endsWith(`/photos/${h2}`) === true && entries[2].details.pageUrl === null)

    console.log('parts')
    const fake = (bytes: number, i: number) => ({ bytes, path: `a/${i}.tif` })
    const split = planParts([fake(400, 1), fake(400, 2), fake(400, 3)], 100, 1200)
    check('parts fill in order up to the size, less the reserve', split.map(p => p.length).join() === '2,1')
    check('a file bigger than a part still gets one of its own', planParts([fake(5000, 1), fake(10, 2)], 0, 1000).map(p => p.length).join() === '1,1')

    console.log('limits')
    const user = { id: owner, isAdmin: false }
    check('the first export is allowed', (await exportLimit(user, 'library')).ok)
    const first = await prisma.libraryExport.create({ data: { userId: owner, scope: 'LIBRARY', title: 'Library', photoIds: library.photoIds } })
    check('nothing more while one is being built', !(await exportLimit(user, 'roll')).ok)
    await prisma.libraryExport.update({ where: { id: first.id }, data: { state: 'READY' } })
    const again = await exportLimit(user, 'library')
    check('a second whole-library export in a week is refused, with when the next one can start',
      !again.ok && again.nextAt !== undefined && Math.abs(again.nextAt.getTime() - first.createdAt.getTime() - 7 * 86_400_000) < 1000)
    check('a roll can still be exported meanwhile', (await exportLimit(user, 'roll')).ok)
    check('admins are not limited', (await exportLimit({ id: owner, isAdmin: true }, 'library')).ok)
    await prisma.libraryExport.update({ where: { id: first.id }, data: { state: 'FAILED' } })
    check('a failed export does not count against the week', (await exportLimit(user, 'library')).ok)
    await prisma.libraryExport.update({ where: { id: first.id }, data: { createdAt: new Date(Date.now() - 8 * 86_400_000), state: 'EXPIRED' } })
    check('nor does one from more than a week ago', (await exportLimit(user, 'library')).ok)

    console.log('a build, end to end')
    // One original gone from storage, to be listed as missing.
    await rm(path.join(root, `originals/${loose}.tif`))
    const job = await prisma.libraryExport.create({ data: { userId: owner, scope: 'LIBRARY', title: 'Library', photoIds: library.photoIds } })
    const progress: number[] = []
    const largest = Math.max(...[u1, h2, h1].map(id => originals.get(id)!.length))
    const result = await buildExport(job.id, {
      storage, readBytesPerSecond: 1e12, onProgress: d => { progress.push(d) },
      // Small parts, so the build splits: two originals in the first, with
      // room for the metadata reserve (twice the metadata and 1MB).
      partMaxBytes: 2 * largest + 1_500_000,
    })
    check('it splits into parts', result.parts.length === 2, String(result.parts.length))
    check('it counts the missing original', result.skipped === 1)
    check('it reports progress per photo', progress.join() === '1,2,3')
    check('it reads each original once', result.bytesRead === [u1, h2, h1].reduce((s, id) => s + originals.get(id)!.length, 0))

    const seen = new Map<string, Buffer>()
    for (const [i, part] of result.parts.entries()) {
      const zip = path.join(root, part.key)
      check(`part ${i + 1} is stored under exports/ at the size recorded`, part.key.startsWith(`exports/${job.id}/`) && (await readFile(zip)).length === part.bytes)
      const test = execFileSync('unzip', ['-t', zip]).toString()
      check(`part ${i + 1} passes unzip -t`, /No errors detected/.test(test), test)
      const dest = path.join(out, `part${i + 1}`)
      execFileSync('unzip', ['-q', zip, '-d', dest])
      const listed = execFileSync('python3', ['-c', 'import sys, zipfile; z = zipfile.ZipFile(sys.argv[1]); z.testzip(); print("\\n".join(z.namelist()))', zip]).toString().trim().split('\n')
      check(`part ${i + 1} reads in Python's zipfile, metadata included`, listed.includes('photos.csv') && listed.includes('photos.json'))
      for (const name of listed) if (!name.startsWith('photos.')) seen.set(name, await readFile(path.join(dest, name)))
    }
    const byPath = new Map(entries.map(e => [e.path, e.id]))
    check('every original comes out byte for byte, in its folder', seen.size === 3
      && [...seen].every(([name, bytes]) => originals.get(byPath.get(name)!)!.equals(bytes)), [...seen.keys()].join())

    const json = JSON.parse(await readFile(path.join(out, 'part2', 'photos.json'), 'utf8'))
    const csv = await readFile(path.join(out, 'part1', 'photos.csv'), 'utf8')
    check('every part lists every photo with its part', json.photos.length === 4 && json.photos.every((p: { part: number | null; status: string }) => (p.status === 'missing') === (p.part === null)))
    check('the missing original is listed as missing', json.photos.find((p: { photoId: string }) => p.photoId === loose)?.status === 'missing')
    check('the CSV is UTF-8 with a byte order mark, quoting what needs it', csv.startsWith('﻿path,part,status') && csv.includes('"ferry, at dusk"') && csv.includes('"pushed, ""one stop"""'))
    check('the original filename keeps its own characters in the metadata', csv.includes('港口.tif'))

    console.log('the media mirror')
    // A mirror whose copy of one original is stale: read from disk, found
    // wrong by its sha256, and read again from the bucket.
    const { Readable } = await import('node:stream')
    const mirrorStorage = {
      ...storage,
      read: async (key: string, options: { bucketOnly?: boolean } = {}) => {
        if (options.bucketOnly) return storage.read(key)
        const bytes = key.includes(h2) ? Buffer.from('a stale copy') : await readFile(path.join(root, key))
        return { stream: Readable.from([bytes]), mirrored: true }
      },
    }
    const viaMirror = await prisma.libraryExport.create({ data: { userId: owner, scope: 'ROLL', title: 'Harbour', photoIds: roll.photoIds } })
    const mirrored = await buildExport(viaMirror.id, { storage: mirrorStorage, readBytesPerSecond: 1e12 })
    check('originals come from the mirror where it has them', mirrored.bytesFromMirror === originals.get(h1)!.length + 'a stale copy'.length)
    check('a stale mirror copy is read again from the bucket, and only it', mirrored.bytesRead === originals.get(h2)!.length)
    execFileSync('unzip', ['-q', '-o', path.join(root, mirrored.parts[0].key), '-d', path.join(out, 'mirror')])
    check('the zip holds the bucket\'s bytes, not the stale copy', (await readFile(path.join(out, 'mirror', entries[1].path))).equals(originals.get(h2)!))

    console.log('a build that cannot be trusted')
    await writeFile(path.join(root, `originals/${h1}.tif`), Buffer.from('not the file that was uploaded'))
    const bad = await prisma.libraryExport.create({ data: { userId: owner, scope: 'ROLL', title: 'Harbour', photoIds: roll.photoIds } })
    let threw = ''
    try { await buildExport(bad.id, { storage, readBytesPerSecond: 1e12 }) } catch (e) { threw = (e as Error).message }
    check('an original that no longer matches its upload fails the build', /does not match/.test(threw), threw)
    const left = existsSync(path.join(root, 'exports', bad.id)) ? readdirSync(path.join(root, 'exports', bad.id), { recursive: true }).filter(f => String(f).endsWith('.zip') || String(f).endsWith('.partial')) : []
    check('and leaves nothing half-built behind', left.length === 0, left.join())
  } finally {
    await cleanup()
    await rm(root, { recursive: true, force: true })
    await rm(out, { recursive: true, force: true })
    await prisma.$disconnect()
  }
  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail) process.exit(1)
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
