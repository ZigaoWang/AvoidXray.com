/**
 * What the server decided about the machine, said once at startup.
 *
 * This exists because of a failure that took a while to see: the box was
 * resized from three cores to six, nothing got faster, and there was no way to
 * tell from outside whether the new cores had been picked up or whether the
 * work was simply somewhere else. The numbers in src/lib/capacity.ts are
 * derived now, which makes them correct and also makes them invisible, so they
 * are printed where a deploy log will keep them.
 *
 * Imported dynamically and only under the Node runtime. capacity.ts reads
 * node:os, which does not exist on the edge, and a static import would pull it
 * into that bundle whether or not this branch ever runs.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return

  const { describeCapacity } = await import('./lib/capacity')
  console.log(describeCapacity())
  warnMissingEnv()
  const { quietMissingImages } = await import('./lib/imageLog')
  quietMissingImages()
}

/**
 * Variables production cannot run without.
 *
 * Each of these failed late and somewhere else when missing: the OSS client is
 * built with `process.env.X!`, so an unset key surfaced as a signature error on
 * the first upload, and a missing secret as sign-ins that stopped working.
 * Warned rather than thrown, so a development checkout without a bucket still
 * starts; but said once, at startup, where a deploy log shows it.
 */
const REQUIRED_IN_PRODUCTION = [
  'DATABASE_URL',
  'NEXTAUTH_SECRET',
  'NEXTAUTH_URL',
  'ALIYUN_OSS_REGION',
  'ALIYUN_OSS_BUCKET',
  'ALIYUN_OSS_ACCESS_KEY_ID',
  'ALIYUN_OSS_ACCESS_KEY_SECRET',
  'CRON_SECRET',
]

function warnMissingEnv() {
  // Development only needs the database; uploads can go to LOCAL_UPLOADS.
  const required = process.env.NODE_ENV === 'production' ? REQUIRED_IN_PRODUCTION : ['DATABASE_URL']
  const missing = required.filter(name => !process.env[name]?.trim())
  if (missing.length === 0) return
  console.error(`[env] MISSING ${missing.join(', ')}. See .env.example and docs/operations.md.`)
}
