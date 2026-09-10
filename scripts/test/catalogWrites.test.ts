/**
 * Every write to a catalog record goes through the revision pipeline.
 *
 * This is a structural fact rather than a rule anyone will remember. Three write
 * paths existed at one point: the admin table, the suggest-edit form and the
 * owner PATCH routes. Unifying "the" admin path unified one of them, so a
 * reslug added to the pipeline reached none of the others and an approved
 * rename silently left its URL behind. Two more turned up on the next audit: a
 * dead rename endpoint and the bulk edit path.
 *
 * The failure is invisible by construction. A new direct write works perfectly
 * except that it produces no diff, no version bump and no provenance, and
 * nothing notices until something downstream depends on one of those.
 *
 * So this asserts the funnel rather than trusting it. A new direct write to a
 * catalog table fails here and has to be either routed through the pipeline
 * or added to ALLOWED with a reason.
 *
 *   npx tsx scripts/test/catalogueWrites.test.ts
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const CATALOGUE = ['filmStock', 'camera', 'brand', 'filmVariant']
const WRITES = ['update', 'updateMany', 'upsert', 'create', 'createMany']

/**
 * Direct writes that are deliberate, each with the reason it does not belong in
 * the pipeline. Anything not listed here is a finding.
 */
const ALLOWED: Array<{ file: string; why: string }> = [
  {
    file: 'src/lib/revisions.ts',
    why: 'The pipeline itself. This is the write everything else funnels into.',
  },
  {
    file: 'src/lib/seo/rename.ts',
    why: 'Writes only the slug, which is derived from a name the pipeline already applied.',
  },
  {
    file: 'src/lib/brands.ts',
    why: 'Creates a brand when a stock names one that does not exist. Creation, not revision.',
  },
  {
    file: 'src/app/api/filmstocks/route.ts',
    why: 'Creates a new stock, and writes the image it was uploaded with. A revision targets a record that already exists.',
  },
  {
    file: 'src/app/api/cameras/route.ts',
    why: 'Creates a new camera, as above.',
  },
  {
    file: 'src/app/api/filmstocks/[id]/image/route.ts',
    why: 'The updateResource implementation the image handler calls. Image fields are a file, not field values.',
  },
  {
    file: 'src/app/api/cameras/[id]/image/route.ts',
    why: 'As above.',
  },
  {
    file: 'src/app/api/admin/moderation/camera/[id]/route.ts',
    why: 'Approving an item in the old queue, which is read-only for new items and scheduled for removal. See docs/db-objects.md.',
  },
  {
    file: 'src/app/api/admin/moderation/filmstock/[id]/route.ts',
    why: 'As above.',
  },
  {
    file: 'src/lib/admin/repository.ts',
    why: 'The brand rows a camera or film points at, edited the same way this ' +
      'file already writes users, photos and comments directly: a company name ' +
      'and its aliases are reference data, not a claim that needs a citation or ' +
      'a review queue. Camera and film writes in this file still funnel through ' +
      'applyAdminEdit a few lines up; only the prisma.brand.* calls in the ' +
      'generic switch match this pattern.',
  },
]

const allowedFiles = new Set(ALLOWED.map(a => a.file))

function walk(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) out.push(...walk(path))
    else if (path.endsWith('.ts') || path.endsWith('.tsx')) out.push(path)
  }
  return out
}

const pattern = new RegExp(
  `(?:prisma|tx)\\.(${CATALOGUE.join('|')})\\.(${WRITES.join('|')})\\b`
)

let found = 0
const offenders: string[] = []

for (const file of walk('src')) {
  const source = readFileSync(file, 'utf8')
  const lines = source.split('\n')
  for (let i = 0; i < lines.length; i++) {
    if (!pattern.test(lines[i])) continue
    found++
    if (!allowedFiles.has(file)) offenders.push(`${file}:${i + 1}  ${lines[i].trim().slice(0, 80)}`)
  }
}

console.log('catalog writes')
console.log(`  ${found} direct writes, ${ALLOWED.length} files deliberately excluded`)

// An allowlist that names files no longer containing a write has gone stale,
// and a stale allowlist quietly permits whatever moves into those paths later.
const stale = ALLOWED.filter(a => {
  try {
    return !pattern.test(readFileSync(a.file, 'utf8'))
  } catch {
    return true
  }
})

if (offenders.length > 0) {
  console.error('\n  A catalog record is being written outside the revision pipeline.')
  console.error('  Route it through applyAdminEdit or submitRevision, or add it to')
  console.error('  ALLOWED in this file with the reason it does not belong there.\n')
  for (const o of offenders) console.error(`    ${o}`)
}

if (stale.length > 0) {
  console.error('\n  These are excluded but no longer contain a direct write:')
  for (const s of stale) console.error(`    ${s.file}`)
  console.error('  Remove them, or the exclusion will cover something else later.')
}

const failed = offenders.length + stale.length
console.log(failed === 0 ? '  every write is accounted for' : `\n  ${failed} problems`)
process.exit(failed === 0 ? 0 : 1)
