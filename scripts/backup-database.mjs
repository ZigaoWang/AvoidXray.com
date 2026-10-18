/**
 * Nightly database backup, kept off the box.
 *
 * The photographs live on object storage and are safe from losing this server.
 * The database is not: it held every account, comment, album and the rows that
 * make the stored images mean anything, and the only dumps that existed were
 * taken by hand before risky work, on the same disk as the database itself. A
 * failed volume would have taken both.
 *
 * Dumps are small — a few hundred kilobytes compressed — so this keeps a week
 * locally for a fast restore and a month on OSS for durability.
 *
 * SAFETY: the bucket serves images publicly, and an object uploaded with the
 * default ACL is world-readable. A dump contains password hashes, email
 * addresses and password-reset tokens. Every upload is therefore explicitly
 * private AND verified unreadable afterwards; if that check ever fails the
 * object is deleted immediately and the run reports failure. Getting this
 * wrong once would publish the entire user table.
 *
 * Dumps are pg_dump's custom format (compressed, one file). To restore into an
 * empty database:
 *
 *   pg_restore --no-owner --no-acl --dbname=<target> avoidxray-<stamp>.dump
 *
 * Older dumps from before the switch are plain SQL, gzipped (.sql.gz):
 *
 *   gunzip -c avoidxray-<stamp>.sql.gz | psql <target>
 *
 *   node scripts/backup-database.mjs
 *   node scripts/backup-database.mjs --dry-run
 */
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdir, readdir, rm, stat, readFile } from 'node:fs/promises'
import path from 'node:path'
import { S3Client, PutObjectCommand, DeleteObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3'

// Node's own loader rather than dotenv, which this project only had through
// another package's dependencies.
try {
  process.loadEnvFile(path.join(process.cwd(), '.env'))
} catch {
  // Already in the environment, as under cron with env set.
}

const run = promisify(execFile)

const LOCAL_DIR = '/root/backups/auto'
/** Enough to recover from a mistake noticed within the week. */
const KEEP_LOCAL_DAYS = 7
/** Long enough to survive a problem nobody noticed for a while. */
const KEEP_REMOTE_DAYS = 30
const PREFIX = 'backups/db/'
/** Both formats ever written, so pruning still ages out the old gzipped SQL. */
const BACKUP_SUFFIXES = ['.dump', '.sql.gz']

const region = process.env.ALIYUN_OSS_REGION
const bucket = process.env.ALIYUN_OSS_BUCKET

const s3 = new S3Client({
  region,
  endpoint: `https://${region}.aliyuncs.com`,
  credentials: {
    accessKeyId: process.env.ALIYUN_OSS_ACCESS_KEY_ID,
    secretAccessKey: process.env.ALIYUN_OSS_ACCESS_KEY_SECRET,
  },
})

const log = (message) => console.log(`[backup] ${message}`)

/**
 * libpq environment for the connection in DATABASE_URL.
 *
 * Prisma URLs can carry parameters libpq rejects (`schema`), so the URL is
 * taken apart rather than handed to pg_dump as-is.
 */
function connectionEnv(url) {
  const parsed = new URL(url)
  const env = {
    PGHOST: decodeURIComponent(parsed.hostname),
    PGPORT: parsed.port || '5432',
    PGUSER: decodeURIComponent(parsed.username),
    PGPASSWORD: decodeURIComponent(parsed.password),
    PGDATABASE: decodeURIComponent(parsed.pathname.replace(/^\//, '')),
  }
  const sslmode = parsed.searchParams.get('sslmode')
  if (sslmode) env.PGSSLMODE = sslmode
  if (!env.PGDATABASE) throw new Error('DATABASE_URL names no database')
  // An empty value would override a working default (a socket host, .pgpass).
  return Object.fromEntries(Object.entries(env).filter(([, value]) => value))
}

/** UTC stamp, so ordering is unambiguous regardless of server timezone. */
function stamp() {
  return new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '').replace('T', '-')
}

async function main() {
  const dryRun = process.argv.includes('--dry-run')

  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL is not set')
  if (!bucket || !region) throw new Error('Aliyun OSS is not configured')

  const connection = connectionEnv(url)

  await mkdir(LOCAL_DIR, { recursive: true })
  const name = `avoidxray-${stamp()}.dump`
  const localPath = path.join(LOCAL_DIR, name)

  if (dryRun) {
    log(`would write ${localPath} and upload to ${PREFIX}${name}`)
    return
  }

  // Run directly, not through a shell. The old `pg_dump | gzip > file` took
  // the pipeline's exit status from gzip, so a pg_dump that died halfway left a
  // truncated file that passed every check below, got uploaded, and would in a
  // month have been the only backups left after pruning. Credentials go in the
  // environment so the password is not in the process list.
  //
  // --no-owner and --no-acl so the dump restores into a database whose roles
  // differ from this one, which is the situation any real recovery is in.
  log('dumping…')
  try {
    await run('pg_dump', ['--no-owner', '--no-acl', '--format=custom', `--file=${localPath}`], {
      env: { ...process.env, ...connection },
      maxBuffer: 1024 * 1024 * 64,
    })
  } catch (error) {
    await rm(localPath, { force: true })
    throw new Error(`pg_dump failed: ${error.stderr?.trim() || error.message}`)
  }

  // pg_restore reads the archive's table of contents, which fails on a file
  // that was cut short. Cheap, and it proves the dump can be restored from.
  try {
    await run('pg_restore', ['--list', localPath], { maxBuffer: 1024 * 1024 * 64 })
  } catch (error) {
    await rm(localPath, { force: true })
    throw new Error(`dump failed verification: ${error.stderr?.trim() || error.message}`)
  }

  const { size } = await stat(localPath)
  if (size < 1024) throw new Error(`dump is only ${size} bytes — refusing to treat that as a backup`)
  log(`wrote ${(size / 1024).toFixed(0)}KB`)

  // Read into memory rather than streamed: Aliyun OSS rejects the AWS SDK's
  // chunked streaming encoding, which is why lib/oss uploads Buffers too. At a
  // few hundred kilobytes this costs nothing.
  const body = await readFile(localPath)
  if (body.length < 1024) throw new Error('dump too small to be valid')

  const key = `${PREFIX}${name}`
  await s3.send(new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: body,
    ContentType: 'application/octet-stream',
    // Explicit, and verified below. The bucket's default is public.
    ACL: 'private',
    // Not a cacheable asset; the immutable header the image path uses would be
    // actively wrong here.
    CacheControl: 'no-store',
  }))
  log(`uploaded ${key}`)

  await assertNotPublic(key)
  await pruneLocal()
  await pruneRemote()
  log('done')
}

/**
 * Confirms the uploaded dump is not world-readable, and destroys it if it is.
 *
 * Runs on every backup rather than once at setup: a bucket policy can change
 * later, and the failure mode here is publishing the user table.
 */
async function assertNotPublic(key) {
  const publicUrl = `https://${bucket}.${region}.aliyuncs.com/${key}`
  const status = await fetch(publicUrl, { method: 'GET' })
    .then((r) => r.status)
    .catch(() => 0)

  if (status === 200) {
    await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key })).catch(() => {})
    throw new Error(
      `${key} was publicly readable and has been deleted. ` +
      'Backups are not being stored until the bucket ACL is fixed.'
    )
  }
  log(`verified private (public fetch returned ${status})`)
}

/** Local copies exist for a fast restore; a week is plenty. */
async function pruneLocal() {
  const cutoff = Date.now() - KEEP_LOCAL_DAYS * 86400_000
  const files = await readdir(LOCAL_DIR).catch(() => [])
  let removed = 0

  for (const file of files) {
    if (!BACKUP_SUFFIXES.some((suffix) => file.endsWith(suffix))) continue
    const full = path.join(LOCAL_DIR, file)
    const info = await stat(full).catch(() => null)
    if (info && info.mtimeMs < cutoff) {
      await rm(full, { force: true })
      removed++
    }
  }
  if (removed) log(`removed ${removed} local backup${removed === 1 ? '' : 's'} older than ${KEEP_LOCAL_DAYS} days`)
}

async function pruneRemote() {
  const cutoff = Date.now() - KEEP_REMOTE_DAYS * 86400_000
  let token
  let removed = 0

  do {
    const page = await s3.send(new ListObjectsV2Command({
      Bucket: bucket, Prefix: PREFIX, ContinuationToken: token,
    }))
    for (const object of page.Contents ?? []) {
      if (!object.Key || !object.LastModified) continue
      if (object.LastModified.getTime() < cutoff) {
        await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: object.Key }))
        removed++
      }
    }
    token = page.NextContinuationToken
  } while (token)

  if (removed) log(`removed ${removed} remote backup${removed === 1 ? '' : 's'} older than ${KEEP_REMOTE_DAYS} days`)
}

main().catch((error) => {
  console.error('[backup] FAILED:', error.message)
  process.exit(1)
})
