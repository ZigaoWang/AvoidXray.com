/**
 * The orphan sweep from the command line: what /admin/maintenance runs,
 * without a browser session. Lists unreferenced objects by prefix; deletes
 * them only with --yes. See src/lib/admin/ossSweep.ts for what counts.
 *
 *   npx tsx scripts/sweep-orphans.ts
 *   npx tsx scripts/sweep-orphans.ts --yes
 */
import 'dotenv/config'
import { prisma } from '../src/lib/db'
import { surveyBucket, sweepOrphans } from '../src/lib/admin/ossSweep'

const byPrefix = (keys: string[]) => {
  const counts: Record<string, number> = {}
  for (const key of keys) {
    const prefix = key.slice(0, key.indexOf('/') + 1) || key
    counts[prefix] = (counts[prefix] ?? 0) + 1
  }
  return counts
}

async function main() {
  const survey = await surveyBucket()
  console.log(`${survey.ossTotal} objects in the bucket, ${survey.dbTotal} referenced`)
  console.log('orphaned, to delete:', byPrefix(survey.orphanedKeys))
  console.log('too recent, kept for now:', byPrefix(survey.tooRecentKeys))
  console.log('unreferenced outside the sweepable prefixes, kept:', byPrefix(survey.unknownKeys))
  if (!process.argv.includes('--yes')) {
    console.log('Dry run: nothing deleted. Run again with --yes.')
    return
  }
  const { deleted, failed } = await sweepOrphans(survey)
  console.log(`deleted ${deleted}, failed ${failed.length}`)
  if (failed.length) process.exitCode = 1
}

main().catch(error => { console.error(error); process.exitCode = 1 }).finally(() => prisma.$disconnect())
