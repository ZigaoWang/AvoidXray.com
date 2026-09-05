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

/**
 * Strings that only appear when the query engine has been bundled.
 *
 * These are Prisma internals, so a version bump could rename them. That would
 * disarm this check while it carried on reporting success, which is worse than
 * not having it at all. Each is therefore confirmed to exist in the installed
 * client first, and a missing sentinel fails the build loudly.
 */
const MARKERS = [
  'unable to run in this browser environment',
  'PrismaClientKnownRequestError',
]

/** Where the markers are expected to live in the installed client. */
const SENTINEL_SOURCE = 'node_modules/.prisma/client/index-browser.js'

function assertMarkersStillExist() {
  let source
  try {
    source = readFileSync(SENTINEL_SOURCE, 'utf8')
  } catch {
    console.error(`[bundle-check] cannot read ${SENTINEL_SOURCE}.`)
    console.error('[bundle-check] Run prisma generate, or update SENTINEL_SOURCE if the path moved.')
    process.exit(1)
  }

  const missing = MARKERS.filter(m => !source.includes(m))
  if (missing.length === MARKERS.length) {
    console.error('[bundle-check] None of the markers appear in the installed Prisma client.')
    console.error('[bundle-check] Prisma has probably renamed them, so this check now proves nothing.')
    console.error('[bundle-check] Find the new browser guard string and update MARKERS:')
    for (const m of missing) console.error(`  no longer present: ${m}`)
    process.exit(1)
  }
}

function walk(dir) {
  const out = []
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) out.push(...walk(path))
    else if (path.endsWith('.js')) out.push(path)
  }
  return out
}

assertMarkersStillExist()

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
