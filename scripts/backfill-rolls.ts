/**
 * Groups every community photo that is not in a roll into proposed rolls, by
 * the rule in src/lib/rollBackfill.ts, and writes a report of them.
 *
 * Writes nothing to the database unless --yes is given; without it, it only
 * reads and reports. With it, each owner's rolls are created in one
 * transaction, frames numbered in upload order. Photos already in a roll are
 * left alone, so a second run proposes only what the first did not cover.
 * Photos that would be a roll of one stay loose, and a rerun leaves them so.
 *
 * The report holds account names and gear, so it goes wherever --report says,
 * which should be outside the repository.
 *
 *   npx tsx scripts/backfill-rolls.ts --report /tmp/rolls.md            # dry run
 *   npx tsx scripts/backfill-rolls.ts --report /tmp/rolls.md --yes      # write
 */
import 'dotenv/config'
import { writeFile } from 'node:fs/promises'
import { PrismaClient } from '@prisma/client'
import { proposeRolls, SESSION_GAP_MS, type ProposedRoll } from '../src/lib/rollBackfill'

function parseArgs(argv: string[]) {
  const i = argv.indexOf('--report')
  const report = i >= 0 ? argv[i + 1] : undefined
  if (!report) throw new Error('--report <file> is required')
  return { report, write: argv.includes('--yes') }
}

const prisma = new PrismaClient()

const when = (d: Date) => d.toISOString().replace('T', ' ').slice(0, 16)
const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : '')
const plural = (n: number, noun: string) => `${n} ${noun}${n === 1 ? '' : 's'}`

async function main() {
  const args = parseArgs(process.argv.slice(2))

  const photos = await prisma.photo.findMany({
    where: { kind: 'COMMUNITY', rollId: null, deletedAt: null },
    select: { id: true, userId: true, createdAt: true, cameraId: true, filmStockId: true, takenDate: true },
  })
  const [owners, cameras, films] = await Promise.all([
    prisma.user.findMany({ where: { id: { in: [...new Set(photos.map(p => p.userId!))] } }, select: { id: true, username: true } }),
    prisma.camera.findMany({ select: { id: true, name: true } }),
    prisma.filmStock.findMany({ select: { id: true, name: true } }),
  ])
  const username = new Map(owners.map(u => [u.id, u.username]))
  const cameraName = new Map(cameras.map(c => [c.id, c.name]))
  const filmName = new Map(films.map(f => [f.id, f.name]))

  const byOwner = new Map<string, typeof photos>()
  for (const photo of photos) {
    const list = byOwner.get(photo.userId!)
    if (list) list.push(photo)
    else byOwner.set(photo.userId!, [photo])
  }

  const proposals = [...byOwner].map(([ownerId, list]) => ({ ownerId, rolls: proposeRolls(list) }))
    .filter(p => p.rolls.length > 0)
    .sort((a, b) => b.rolls.length - a.rolls.length)

  const total = proposals.reduce((n, p) => n + p.rolls.length, 0)
  const placed = proposals.reduce((n, p) => n + p.rolls.reduce((m, r) => m + r.photos.length, 0), 0)
  const lines = [
    `# Proposed rolls${args.write ? '' : ' (dry run)'}`,
    '',
    `Generated ${new Date().toISOString()}. Sessions split at gaps over ${SESSION_GAP_MS / 60000} minutes, then by camera and film. A group of one photo stays loose.`,
    '',
    `${photos.length} photos not in a roll, ${proposals.length} owners, ${total} proposed rolls holding ${placed} photos; ${photos.length - placed} stay loose.`,
    '',
  ]
  for (const { ownerId, rolls } of proposals) {
    const count = rolls.reduce((n, r) => n + r.photos.length, 0)
    lines.push(`## ${username.get(ownerId) ?? ownerId}: ${plural(rolls.length, 'roll')}, ${plural(count, 'photo')}`, '')
    lines.push('| # | Photos | First upload (UTC) | Last upload (UTC) | Camera | Film | Shot (typed dates) |')
    lines.push('|---|---|---|---|---|---|---|')
    rolls.forEach((roll, i) => {
      const shot = roll.shotFrom ? (day(roll.shotFrom) === day(roll.shotTo) ? day(roll.shotFrom) : `${day(roll.shotFrom)} to ${day(roll.shotTo)}`) : ''
      lines.push(`| ${i + 1} | ${roll.photos.length} | ${when(roll.firstUpload)} | ${when(roll.lastUpload)} | ${roll.cameraId ? cameraName.get(roll.cameraId) ?? roll.cameraId : 'none'} | ${roll.filmStockId ? filmName.get(roll.filmStockId) ?? roll.filmStockId : 'none'} | ${shot} |`)
    })
    lines.push('')
  }
  await writeFile(args.report, lines.join('\n'))
  console.log(`${total} proposed rolls for ${photos.length} photos; report written to ${args.report}`)

  if (!args.write) {
    console.log('Dry run: nothing written. Run again with --yes to create these rolls.')
    return
  }

  for (const { ownerId, rolls } of proposals) {
    await prisma.$transaction(async tx => {
      for (const roll of rolls) await createRoll(tx, ownerId, roll)
    }, { timeout: 120_000 })
    console.log(`  ${username.get(ownerId) ?? ownerId}: ${plural(rolls.length, 'roll')} written`)
  }
}

type Tx = Parameters<Parameters<PrismaClient['$transaction']>[0]>[0]

async function createRoll(tx: Tx, ownerId: string, roll: ProposedRoll) {
  const created = await tx.roll.create({
    data: {
      ownerId,
      cameraId: roll.cameraId,
      filmStockId: roll.filmStockId,
      shotFrom: roll.shotFrom,
      shotFromPrecision: roll.shotFrom ? 'DAY' : null,
      shotTo: roll.shotTo,
      shotToPrecision: roll.shotTo ? 'DAY' : null,
    },
    select: { id: true },
  })
  // One update per frame for its position; the trigger checks the roll's
  // camera and film against the photo's, which match by construction.
  for (const [position, photo] of roll.photos.entries()) {
    await tx.photo.update({ where: { id: photo.id }, data: { rollId: created.id, rollPosition: position + 1 } })
  }
}

main()
  .catch(error => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
