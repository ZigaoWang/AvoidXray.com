/**
 * Every raw SQL visibility clause also keeps archive photos out.
 *
 * Prisma queries get the rule from PUBLIC_PHOTO and visibleToViewer. Raw SQL
 * cannot spread a constant, so each query that writes out the public rule by
 * hand (`visibility = 'public'`) has to write `kind = 'community'` beside it,
 * and a new one that forgets would show archive photos as community uploads.
 * This reads the source rather than a database, so it runs with the rest of
 * `npm test`; archiveVisibility.test.ts checks the queries themselves.
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

let pass = 0
let fail = 0

for (const file of sources(root)) {
  const lines = readFileSync(file, 'utf8').split('\n')
  lines.forEach((line, i) => {
    if (!/visibility = 'public'/.test(line) || /^\s*(\/\/|\*)/.test(line)) return
    // The clause and the few lines before it: a WHERE is often split across lines.
    const window = lines.slice(Math.max(0, i - 3), i + 1).join('\n')
    const where = `${path.relative(root, file)}:${i + 1}`
    if (/kind = 'community'/.test(window)) {
      pass++
    } else {
      fail++
      console.error(`  FAIL  ${where} filters on visibility without kind = 'community'`)
    }
  })
}

console.log(`  ${pass} raw SQL visibility clauses checked`)
console.log(`\n${pass} passed, ${fail} failed`)
if (pass === 0 || fail > 0) process.exit(1)
