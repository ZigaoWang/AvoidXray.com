/**
 * Records the passage behind citations that were stored as a bare URL.
 *
 * An earlier research pass wrote a source URL against a claim without keeping
 * the words that carry it. That is what made Fujifilm 400 look wrong: the
 * manufacturer is cited to the Wikipedia article on Superia, which is correct
 * because the sentence lives there, and nothing on the page let a reader see
 * that without opening it.
 *
 * Every passage below was read in the source it is attached to. Where the
 * source could not be fetched and read, the row is left alone: it then renders
 * as "no supporting passage was recorded", which is the honest state and better
 * than a quote nobody checked. Those are listed at the bottom.
 *
 *   npx tsx scripts/backfill-citation-passages.ts [--apply]
 */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const apply = process.argv.includes('--apply')

interface Backfill {
  stock: string
  fields: string[]
  /** Must match the sourceUrl already stored, or the row is skipped. */
  url: string
  /** Verbatim from that page, read on 2026-09-05. */
  passage: string
}

const BACKFILLS: Backfill[] = [
  {
    stock: 'Fujifilm 400',
    fields: ['manufacturerStatus', 'manufacturedByBrandId'],
    url: 'https://en.wikipedia.org/wiki/Fujifilm_Superia',
    passage: 'replaced by Fujifilm 400, contract manufactured by Kodak',
  },
  {
    stock: 'Ilford HP5 Plus 400',
    fields: ['manufacturerStatus', 'manufacturedByBrandId'],
    url: 'https://en.wikipedia.org/wiki/Ilford_Photo',
    passage:
      'Harman Technology Limited, trading as Ilford Photo, is a British manufacturer of photographic materials best known for its Ilford branded black-and-white film',
  },
  {
    // The sentence names paper rather than film, and says so. Recording it
    // verbatim is the point: a reader can see the claim rests on Harman owning
    // Kentmere and moving production, not on a statement that Harman coats this
    // emulsion. Ilford's own site says the latter outright and would be the
    // better citation; it could not be fetched here, so it is not claimed.
    stock: 'Kentmere Pan 400',
    fields: ['manufacturerStatus', 'manufacturedByBrandId'],
    url: 'https://en.wikipedia.org/wiki/Ilford_Photo',
    passage:
      'In 2007, Harman Technology acquired Kentmere Photographic Ltd, a manufacturer of photographic paper in Kentmere, Lake District. Production moved to Mobberley.',
  },
]

/** Cited, but the source could not be read from here, so nothing is claimed. */
const UNVERIFIED = [
  'Yes!Star 400 (manufacturer) — fujirumors.com could not be fetched',
  'Lucky Color 200 (manufacturer) — kosmofoto.com returned 403',
  'Lucky Color 400 (manufacturer) — 35mmc.com not fetched',
  'Orwo Wolfen NC400 (colour balance, manufacturer) — bhphotovideo.com returned 403',
]

async function main() {
  let written = 0
  let skipped = 0

  for (const entry of BACKFILLS) {
    const stock = await prisma.filmStock.findFirst({
      where: { name: entry.stock },
      select: { id: true },
    })
    if (!stock) {
      console.log(`  no such stock  ${entry.stock}`)
      skipped++
      continue
    }

    for (const field of entry.fields) {
      const row = await prisma.fieldProvenance.findUnique({
        where: {
          entityType_entityId_fieldName: {
            entityType: 'FILM_STOCK',
            entityId: stock.id,
            fieldName: field,
          },
        },
        select: { sourceUrl: true, claims: true },
      })

      if (!row) {
        console.log(`  no provenance  ${entry.stock} ${field}`)
        skipped++
        continue
      }
      // The passage was read in one specific page. If the row cites a different
      // one, the passage does not belong to it.
      if (row.sourceUrl !== entry.url) {
        console.log(`  url differs    ${entry.stock} ${field}  stored=${row.sourceUrl}`)
        skipped++
        continue
      }
      const existing = Array.isArray(row.claims) ? row.claims : []
      if (existing.length > 0) {
        console.log(`  already set    ${entry.stock} ${field}`)
        skipped++
        continue
      }

      if (!apply) {
        console.log(`  would record   ${entry.stock} ${field}`)
        continue
      }

      await prisma.fieldProvenance.update({
        where: {
          entityType_entityId_fieldName: {
            entityType: 'FILM_STOCK',
            entityId: stock.id,
            fieldName: field,
          },
        },
        data: { claims: [{ claim: entry.passage, url: entry.url }] },
      })
      console.log(`  recorded       ${entry.stock} ${field}`)
      written++
    }
  }

  console.log(`\n  ${written} recorded, ${skipped} skipped`)
  console.log('\n  Still carrying a bare URL, source unreadable from here:')
  for (const line of UNVERIFIED) console.log(`    ${line}`)

  await prisma.$disconnect()
}

main()
