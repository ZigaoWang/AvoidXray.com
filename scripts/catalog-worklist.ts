/**
 * Every catalog entry, with what it says now and what is wrong with it, as a
 * brief somebody can work straight through.
 *
 * research-brief.ts answers a different question: which fields are empty and
 * which claims lack a passage. This one is about the prose. It prints the
 * summary and description in full, because the job is rewriting them and a
 * forty-character preview cannot be rewritten from.
 *
 * The rules at the top are the same four the add and edit forms show, so a
 * batch written from this reads like the entries written through the site.
 *
 *   DATABASE_URL=<clone> npx tsx scripts/catalog-worklist.ts > catalog-worklist.md
 */

import { PrismaClient } from '@prisma/client'
import { filmProcessLabel, colorBalanceLabel } from '../src/lib/filmFields'
import { bodyTypeLabel } from '../src/lib/cameraFields'
import { summaryFromDescription } from '../src/lib/catalogForm'

const prisma = new PrismaClient()

const MARKETING = /\b(iconic|legendary|cult classic|beloved|ultra-affordable|stunning|amazing|must-have|game-changing|revolutionary)\b/i
const SUPERLATIVE = /\b(the only|the first|the best|the most)\b/i
const ATTRIBUTED = /\b(kodak|ilford|fujifilm|canon|nikon|olympus|harman|lomography|reviewers?|labs?|the manufacturer) (says|calls|claims|describes|rates|reports|positions)\b/i
const MIN_WORDS = 15

function problems(name: string, summary: string | null, description: string | null): string[] {
  const text = (description ?? '').trim()
  if (!text) return ['no description at all']

  const out: string[] = []
  const words = text.split(/\s+/).length
  const first = text.split('\n')[0].trim().toLowerCase()
  const lead = name.split(/\s+/).slice(0, 2).join(' ').toLowerCase()

  if (first.startsWith(lead) || first.startsWith(`the ${lead}`)) {
    out.push('opens by restating the name, so the first line duplicates the summary')
  }
  if (!summary) out.push('no summary, because the first line is too long to take one from')
  if (words < MIN_WORDS) out.push(`only ${words} words, which is one fact rather than a description`)

  const marketing = text.match(MARKETING)
  if (marketing) out.push(`uses "${marketing[0]}"`)

  const superlative = text.match(SUPERLATIVE)
  if (superlative && !ATTRIBUTED.test(text)) out.push(`unattributed superlative: "${superlative[0]}"`)

  return out
}

const RULES = `## How to write these

Four rules. Everything else follows from them.

1. **Open with one sentence saying what it is.** That line is taken as the
   summary and printed above the description, so the description must not
   repeat it. Start the body from the second thing.
2. **Then what the spec chips cannot say.** For a camera: the lens, how it
   focuses and meters, what it is like to carry. For a film: how it looks, how
   it behaves, what it is for.
3. **Skip anything already shown beside it.** Body type, format, year, ISO
   and process each render as their own chip, and a stock's lengths are in the
   "Sold in" line. Prose that repeats them is duplication that goes stale on
   its own.
4. **Write what is known and stop.** No "iconic", no "legendary", no "the best",
   no "the only". A claim about everything else ever made is almost always
   wrong. If a maker says something, say that they say it.

Aim for 40 to 150 words. There is no minimum worth padding to: four true
sentences beat eight with two guesses in them.

### An entry that follows them

> A 1993 zoom compact with a 38 to 115mm lens, sold as the Sure Shot Z115 in the
> Americas.
>
> The lens is ten elements in nine groups, one of them aspherical, and opens to
> f/3.6 at the wide end. It focuses to 0.6m.
>
> At 350g on two CR123A cells it is a lot of camera to carry for a compact. The
> long end is dim: f/8.5 at 115mm, so you are on flash or fast film well before
> you get there.
`

function block(label: string, value: string | null): string {
  if (!value || !value.trim()) return `- **${label}:** (empty)`
  return `- **${label}:**\n\n${value.trim().split(/\r?\n/).map(l => `  > ${l}`).join('\n')}\n`
}

async function main() {
  const [films, cameras] = await Promise.all([
    prisma.filmStock.findMany({ orderBy: { name: 'asc' } }),
    prisma.camera.findMany({ orderBy: { name: 'asc' } }),
  ])

  console.log('# Catalog worklist\n')
  console.log(`${films.length} film stocks and ${cameras.length} cameras, from the live database.`)
  console.log('Rewrite the summary and description of anything marked **Needs work**.')
  console.log('Leave the specification fields alone unless one is plainly wrong; they render')
  console.log('as chips and are edited elsewhere.\n')
  console.log(RULES)

  console.log('\n## Film stocks\n')
  for (const f of films) {
    const notes = problems(f.name, summaryFromDescription(f.description), f.description)
    const specs = [
      f.iso && `ISO ${f.iso}`,
      filmProcessLabel(f.process),
      colorBalanceLabel(f.colorBalance),
      f.format.length ? f.format.join(', ') : null,
    ].filter(Boolean).join(' · ')

    console.log(`### ${f.name}`)
    console.log(`\`/films/${f.slug ?? f.id}\` · ${specs || 'no specs recorded'}\n`)
    console.log(block('Summary now', summaryFromDescription(f.description)))
    console.log(block('Description now', f.description))
    console.log(notes.length ? `- **Needs work:** ${notes.join('; ')}\n` : '- Reads fine as it stands.\n')
  }

  console.log('\n## Cameras\n')
  for (const c of cameras) {
    const notes = problems(c.name, summaryFromDescription(c.description), c.description)
    const specs = [
      bodyTypeLabel(c.bodyType),
      c.format,
      c.year && String(c.year),
    ].filter(Boolean).join(' · ')

    console.log(`### ${c.name}`)
    console.log(`\`/cameras/${c.slug ?? c.id}\` · ${specs || 'no specs recorded'}`)
    if (c.aliases.length) console.log(`Also known as: ${c.aliases.join(', ')}`)
    console.log()
    console.log(block('Summary now', summaryFromDescription(c.description)))
    console.log(block('Description now', c.description))
    console.log(notes.length ? `- **Needs work:** ${notes.join('; ')}\n` : '- Reads fine as it stands.\n')
  }

  await prisma.$disconnect()
}

main().catch(async error => {
  console.error(error)
  await prisma.$disconnect()
  process.exit(1)
})
