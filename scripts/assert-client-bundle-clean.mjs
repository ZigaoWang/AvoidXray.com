/**
 * Fails the build if the database client reaches the browser.
 *
 * This shipped once: a module-scope `Prisma.raw()` in a file the pickers import
 * put the query engine in the client bundle, and every page threw on load. The
 * build passed, typecheck passed, and every route still answered 200, because
 * the failure is entirely in the browser.
 *
 * Checked against the built output rather than the import graph, because the
 * import graph has legitimate edges the bundler is expected to erase: type-only
 * imports, tree-shaken constants, and middleware, which is neither a server
 * component nor a client one and so cannot use the `server-only` package.
 * What matters is not who imports what, it is what ends up in .next/static.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const STATIC_DIR = '.next/static'

/** Strings that only appear when the query engine has been bundled. */
const MARKERS = [
  'unable to run in this browser environment',
  'PrismaClientKnownRequestError',
]

function walk(dir) {
  const out = []
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) out.push(...walk(path))
    else if (path.endsWith('.js')) out.push(path)
  }
  return out
}

let files
try {
  files = walk(STATIC_DIR)
} catch {
  console.error(`[bundle-check] ${STATIC_DIR} not found. Run after next build.`)
  process.exit(1)
}

const offenders = files.filter(f => {
  const source = readFileSync(f, 'utf8')
  return MARKERS.some(m => source.includes(m))
})

if (offenders.length > 0) {
  console.error('[bundle-check] The database client is in the browser bundle.')
  console.error('[bundle-check] Something a client component imports now reaches @/lib/db.')
  console.error('[bundle-check] Look for module-scope work, not just the import itself:')
  console.error('[bundle-check] a top-level Prisma.raw() or a new PrismaClient() cannot be shaken out.')
  for (const f of offenders) console.error(`  ${f}`)
  process.exit(1)
}

console.log(`[bundle-check] ${files.length} client chunks, none carry the database client.`)
