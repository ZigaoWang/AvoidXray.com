/**
 * Every raw SQL visibility clause writes out the whole public rule.
 *
 * Prisma queries get the rule from PUBLIC_PHOTO and visibleToViewer. Raw SQL
 * cannot spread a constant, so each query that writes it out by hand
 * (`visibility = 'public'`) has to write every other part beside it: the
 * community kind, a finished upload, a cleared screening, and not in the
 * trash. A new query that forgets one shows archive photos, drafts, held
 * photos or deleted ones. This reads the source rather than a database, so it
 * runs with the rest of `npm test`; photoPrivacy.test.ts and
 * archiveVisibility.test.ts check the queries themselves.
 *
 *   npx tsx scripts/test/sqlVisibility.test.ts
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '../../src')

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const full = path.join(dir, name)
    if (statSync(full).isDirectory()) return sources(full)
    return /\.tsx?$/.test(name) ? [full] : []
  })
}

/** Each part of the public rule, as raw SQL writes it. */
const REQUIRED: [string, RegExp][] = [
  ["kind = 'community'", /kind = 'community'/],
  ['"uploadComplete"', /"uploadComplete"/],
  ["screening = 'clear'", /screening = 'clear'/],
  ['"deletedAt" IS NULL', /"deletedAt" IS NULL/],
]

/**
 * Clauses that filter on visibility for a reason other than showing photos
 * publicly, and why. Exact file and line text, so a new clause in the same file
 * is still checked.
 */
const ALLOWED: { file: string; line: string; why: string }[] = [
  {
    file: 'lib/library/browse.ts',
    line: "if (f.status === 'published') parts.push(Prisma.sql`p.visibility = 'public'`)",
    why: 'The owner narrowing their own library to what they published. Every row is already theirs, private and held ones included on purpose.',
  },
]

let pass = 0
let fail = 0

for (const file of sources(root)) {
  const lines = readFileSync(file, 'utf8').split('\n')
  lines.forEach((line, i) => {
    if (!/visibility = 'public'/.test(line) || /^\s*(\/\/|\*)/.test(line)) return
    if (ALLOWED.some(a => a.file === path.relative(root, file) && line.trim() === a.line)) return
    // The clause and the few lines around it: a WHERE is often split across lines.
    const window = lines.slice(Math.max(0, i - 3), i + 2).join('\n')
    const where = `${path.relative(root, file)}:${i + 1}`
    const missing = REQUIRED.filter(([, pattern]) => !pattern.test(window)).map(([name]) => name)
    if (missing.length === 0) {
      pass++
    } else {
      fail++
      console.error(`  FAIL  ${where} filters on visibility without ${missing.join(', ')}`)
    }
  })
}

console.log(`  ${pass} raw SQL visibility clauses checked`)
console.log(`\n${pass} passed, ${fail} failed`)
if (pass === 0 || fail > 0) process.exit(1)
