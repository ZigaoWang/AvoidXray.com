/**
 * Every library API route is behind the library feature.
 *
 * The library is admin-only until it is opened to everyone, and the gate is
 * one call at the top of each handler (requireLibraryUser). Leaving it off a
 * new handler would open that route to every account without any test of the
 * happy path noticing, so this asserts it for every exported handler under
 * src/app/api/library.
 *
 *   npx tsx scripts/test/libraryGate.test.ts
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = 'src/app/api/library'

/** Handlers with no account behind them, and what stands in for the gate. */
const EXEMPT: Record<string, string> = {
  'src/app/api/library/local-parts/route.ts': 'Development only; each URL is signed by multipart.ts and refused outside LOCAL_UPLOADS.',
}

function routes(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) return routes(full)
    return name === 'route.ts' ? [full] : []
  })
}

let pass = 0
let fail = 0
for (const file of routes(ROOT)) {
  if (EXEMPT[file]) continue
  const source = readFileSync(file, 'utf8')
  const handlers = [...source.matchAll(/export async function (GET|POST|PUT|PATCH|DELETE)\([^\n]*\) \{\n([\s\S]*?)\n\}/g)]
  const exported = source.match(/export async function /g)?.length ?? 0
  if (handlers.length !== exported) {
    fail++
    console.log(`  FAIL  ${file}: ${exported - handlers.length} handler(s) not in the expected shape, so not checked`)
  }
  for (const [, method, body] of handlers) {
    const ok = /^\s*const user = await requireLibraryUser\(\)\s*\n\s*if \(user instanceof NextResponse\) return user/.test(body)
    if (ok) pass++
    else fail++
    console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${method} ${file}${ok ? '' : ': does not start with the library gate'}`)
  }
}
if (pass === 0) {
  fail++
  console.log('  FAIL  found no library handlers to check')
}

console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)
