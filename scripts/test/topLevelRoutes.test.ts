/**
 * Keeps the proxy's list of top-level routes in step with the route tree.
 *
 * The proxy reads any first segment it does not know as a username and answers
 * 404 when no such account exists. A route added under src/app without being
 * listed would be that 404. This derives both lists from the files git tracks,
 * ignoring the empty directories a checkout can carry, and compares.
 *
 *   npx tsx scripts/test/topLevelRoutes.test.ts
 */
import { execSync } from 'node:child_process'
import { TOP_LEVEL_PAGES, TOP_LEVEL_PREFIXES } from '../../src/lib/topLevelRoutes'

let pass = 0
let fail = 0

function check(name: string, got: string[], want: string[]) {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (ok) pass++
  else fail++
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `\n    got=${JSON.stringify(got)}\n    want=${JSON.stringify(want)}`}`)
}

const files = execSync('git ls-files src/app public', { encoding: 'utf8' }).trim().split('\n')

// A segment with a dot never reaches the proxy, and groups and dynamic segments
// are not literal path segments.
const literal = (segment: string) => !segment.includes('.') && !/^[([]/.test(segment)

const pages = new Set<string>()
const prefixes = new Set<string>()

for (const file of files) {
  const parts = file.split('/')

  if (parts[0] === 'public') {
    if (parts.length > 2 && literal(parts[1])) prefixes.add(parts[1])
    continue
  }

  // src/app/<file>: a metadata image route such as opengraph-image.tsx.
  if (parts.length === 3) {
    const name = parts[2].replace(/\.[^.]+$/, '')
    if (/^(opengraph-image|twitter-image|icon|apple-icon)$/.test(name)) pages.add(name)
    continue
  }

  const top = parts[2]
  if (!literal(top)) continue

  // The bare path renders when a page or handler sits directly under the
  // segment, or under route groups inside it: films/(index)/page.tsx is /films.
  const between = parts.slice(3, -1)
  const leaf = parts[parts.length - 1]
  if (between.every((s) => /^\(.+\)$/.test(s)) && /^(page|route)\.[jt]sx?$/.test(leaf)) pages.add(top)
  else prefixes.add(top)
}

for (const page of pages) prefixes.delete(page)

check('top-level pages', [...pages].sort(), [...TOP_LEVEL_PAGES].sort())
check('top-level prefixes', [...prefixes].sort(), [...TOP_LEVEL_PREFIXES].sort())

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
