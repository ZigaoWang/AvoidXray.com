/**
 * Backfill `slug` for every FilmStock and Camera.
 *
 * Run once after the 20260806120000_add_slugs_and_timestamps migration, and
 * again any time rows are created by a path that doesn't set a slug. It is
 * idempotent: rows that already have a slug are left alone, and existing slugs
 * are treated as taken so nothing gets stolen or renamed. Renaming a slug after
 * it has been indexed costs you the ranking, so we never overwrite.
 *
 *   npx tsx scripts/backfill-slugs.ts          # apply
 *   npx tsx scripts/backfill-slugs.ts --dry    # preview only
 */

import { PrismaClient } from '@prisma/client'
import { entitySlug, uniqueSlug } from '../src/lib/seo/slug'

const prisma = new PrismaClient()
const DRY_RUN = process.argv.includes('--dry')

async function backfillFilmStocks() {
  const films = await prisma.filmStock.findMany({
    select: { id: true, name: true, brand: true, slug: true },
    orderBy: { name: 'asc' },
  })

  const taken = new Set(films.map((f) => f.slug).filter((s): s is string => !!s))
  let changed = 0

  for (const film of films) {
    if (film.slug) continue

    const slug = uniqueSlug(entitySlug(film.name, film.brand), taken)
    taken.add(slug)
    changed++

    console.log(`  film   ${film.name.padEnd(34)} -> /films/${slug}`)
    if (!DRY_RUN) {
      await prisma.filmStock.update({ where: { id: film.id }, data: { slug } })
    }
  }

  console.log(`  ${changed} film stock slug(s) ${DRY_RUN ? 'would be set' : 'set'}\n`)
}

async function backfillCameras() {
  // Cameras are user-scoped (@@unique([name, userId])), so two users can both
  // own a "Nikon FM2". Order by photo count so the most-populated camera wins
  // the clean slug and the rest get -2, -3 suffixes.
  const cameras = await prisma.camera.findMany({
    select: {
      id: true,
      name: true,
      brand: true,
      slug: true,
      _count: { select: { photos: true } },
    },
  })
  cameras.sort((a, b) => b._count.photos - a._count.photos || a.name.localeCompare(b.name))

  const taken = new Set(cameras.map((c) => c.slug).filter((s): s is string => !!s))
  let changed = 0

  for (const camera of cameras) {
    if (camera.slug) continue

    const slug = uniqueSlug(entitySlug(camera.name, camera.brand), taken)
    taken.add(slug)
    changed++

    console.log(
      `  camera ${camera.name.padEnd(34)} -> /cameras/${slug}  (${camera._count.photos} photos)`
    )
    if (!DRY_RUN) {
      await prisma.camera.update({ where: { id: camera.id }, data: { slug } })
    }
  }

  console.log(`  ${changed} camera slug(s) ${DRY_RUN ? 'would be set' : 'set'}\n`)
}

async function main() {
  console.log(DRY_RUN ? '\nDRY RUN — no writes\n' : '\nBackfilling slugs\n')
  await backfillFilmStocks()
  await backfillCameras()

  const [filmsMissing, camerasMissing] = await Promise.all([
    prisma.filmStock.count({ where: { slug: null } }),
    prisma.camera.count({ where: { slug: null } }),
  ])

  if (!DRY_RUN && (filmsMissing || camerasMissing)) {
    throw new Error(`Incomplete: ${filmsMissing} films and ${camerasMissing} cameras still lack a slug`)
  }
  console.log('Done.')
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
