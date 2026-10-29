/**
 * Removes imported archive photos: their rows, then their stored files.
 *
 * The way back from scripts/import-archive.ts. Rows go first and files after,
 * the same order as discardStoredKeys: a file left behind costs storage, a row
 * left pointing at a deleted file shows every visitor a broken image.
 *
 * Without --ids it removes the whole source: every ARCHIVE photo imported from
 * it, the source row, and every object under archive/{source}/, including any
 * a killed run uploaded without writing rows for. With --ids it removes only
 * those items and their files.
 *
 * Writes nothing unless --yes is given; without it, it prints what it would do.
 *
 *   npx tsx scripts/rollback-archive.ts                       # dry run, whole source
 *   npx tsx scripts/rollback-archive.ts --ids 2017877351      # dry run, one item
 *   npx tsx scripts/rollback-archive.ts --ids 2017877351 --yes
 */

import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { discardStoredKeys, listOSSObjects } from '../src/lib/oss'
import { extractKeyFromUrl } from '../src/lib/ossUtils'

const SOURCES = ['fsa-owi-color'] as const

function parseArgs(argv: string[]) {
  const value = (flag: string) => {
    const i = argv.indexOf(flag)
    return i >= 0 ? argv[i + 1] : undefined
  }
  const source = value('--source') ?? 'fsa-owi-color'
  if (!(SOURCES as readonly string[]).includes(source)) throw new Error(`Unknown source ${source}`)
  const ids = value('--ids')?.split(',').map(id => id.trim()).filter(Boolean)
  if (ids && ids.length === 0) throw new Error('--ids takes a comma-separated list of item ids')
  return { source, ids: ids ?? null, write: argv.includes('--yes') }
}

const prisma = new PrismaClient()

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const prefix = `archive/${args.source}/`
  console.log(`${args.write ? 'Rollback' : 'Dry run'}: ${args.source}${args.ids ? `, items ${args.ids.join(', ')}` : ', whole source'}`)

  const records = await prisma.archiveRecord.findMany({
    where: { source: { slug: args.source }, ...(args.ids && { externalId: { in: args.ids } }) },
    select: {
      externalId: true,
      fullPath: true,
      photo: { select: { id: true, kind: true, originalPath: true, mediumPath: true, thumbnailPath: true } },
    },
  })
  const notArchive = records.filter(r => r.photo.kind !== 'ARCHIVE')
  if (notArchive.length) throw new Error(`Refusing: not ARCHIVE photos: ${notArchive.map(r => r.externalId).join(', ')}`)
  if (args.ids) {
    const missing = args.ids.filter(id => !records.some(r => r.externalId === id))
    if (missing.length) console.warn(`  not imported: ${missing.join(', ')}`)
  }

  // Files named by the rows, plus, for a whole source, everything else under
  // its prefix. Only keys under the prefix, whatever a row says.
  const rowKeys = records.flatMap(r =>
    [r.photo.originalPath, r.photo.mediumPath, r.photo.thumbnailPath, r.fullPath].map(url => (url ? extractKeyFromUrl(url) : null))
  )
  const keys = new Set(rowKeys.filter((key): key is string => !!key && key.startsWith(prefix)))
  if (!args.ids) for (const object of await listOSSObjects(prefix)) keys.add(object.key)

  console.log(`  photos and archive records: ${records.length}`)
  console.log(`  stored objects under ${prefix}: ${keys.size}`)
  if (!args.write) {
    console.log('  nothing changed; pass --yes to remove them')
    return
  }

  const photoIds = records.map(r => r.photo.id)
  // Archive records go with their photos (onDelete Cascade).
  const deleted = await prisma.photo.deleteMany({ where: { id: { in: photoIds }, kind: 'ARCHIVE' } })
  console.log(`  deleted ${deleted.count} photos`)
  if (!args.ids) {
    const source = await prisma.archiveSource.deleteMany({ where: { slug: args.source } })
    console.log(`  deleted ${source.count} source row`)
  }
  await discardStoredKeys([...keys], `archive rollback ${args.source}`)
  console.log(`  deleted ${keys.size} stored objects`)
}

main()
  .catch(error => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
