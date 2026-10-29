/**
 * `npm test`: every test file here that needs no database, one after another.
 *
 * This was a chain of thirty `tsx a && tsx b && ...` in package.json. A new
 * test file had to be added to it by hand or it never ran, and the first
 * failure stopped the chain, so one broken test hid the results of every test
 * after it. Here the list is the directory, every file runs, and the summary
 * names each one that failed.
 *
 * One at a time, not in parallel: sharpPipeline and exportGeometry render
 * real images, and several at once is enough to stall a laptop.
 *
 *   npm test
 *   node scripts/test/run.mjs capacity renderSlot   # only files matching these
 */
import { spawnSync } from 'node:child_process'
import { readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))

/**
 * Need a live database, so CI runs them in their own steps against a
 * throwaway one (.github/workflows/schema.yml). privateStorage also writes to
 * the real bucket, so it runs only by hand; see its header.
 */
const NEEDS_DATABASE = new Set(['archiveVisibility.test.ts', 'authGate.test.ts', 'photoPrivacy.test.ts', 'privateStorage.test.ts', 'revisionPipeline.test.ts'])

const filters = process.argv.slice(2)
const files = readdirSync(here)
  .filter(name => /\.test\.tsx?$/.test(name) && !NEEDS_DATABASE.has(name))
  .filter(name => filters.length === 0 || filters.some(f => name.includes(f)))
  .sort()

if (files.length === 0) {
  console.error('No test files matched.')
  process.exit(1)
}

const tsx = fileURLToPath(import.meta.resolve('tsx/cli'))
const failed = []
const started = Date.now()

for (const name of files) {
  console.log(`\n=== ${name}`)
  const { status, signal } = spawnSync(process.execPath, [tsx, path.join(here, name)], { stdio: 'inherit' })
  if (status !== 0) failed.push(signal ? `${name} (${signal})` : name)
}

const seconds = ((Date.now() - started) / 1000).toFixed(1)
console.log(`\n${files.length - failed.length} of ${files.length} test files passed in ${seconds}s`)
if (failed.length > 0) {
  console.error(`Failed:\n${failed.map(name => `  ${name}`).join('\n')}`)
  process.exit(1)
}
