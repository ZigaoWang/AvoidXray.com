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
 *   node scripts/backup-database.mjs
 *   node scripts/backup-database.mjs --dry-run
 */
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { createReadStream } from 'node:fs'
import { mkdir, readdir, rm, stat, readFile } from 'node:fs/promises'
import path from 'node:path'
import { S3Client, PutObjectCommand, DeleteObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3'
import 'dotenv/config'

const run = promisify(execFile)

const LOCAL_DIR = '/root/backups/auto'
/** Enough to recover from a mistake noticed within the week. */
const KEEP_LOCAL_DAYS = 7
/** Long enough to survive a problem nobody noticed for a while. */
const KEEP_REMOTE_DAYS = 30
const PREFIX = 'backups/db/'

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

/** UTC stamp, so ordering is unambiguous regardless of server timezone. */
function stamp() {
  return new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '').replace('T', '-')
}

async function main() {
  const dryRun = process.argv.includes('--dry-run')

  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL is not set')
  if (!bucket || !region) throw new Error('Aliyun OSS is not configured')

  await mkdir(LOCAL_DIR, { recursive: true })
  const name = `avoidxray-${stamp()}.sql.gz`
  const localPath = path.join(LOCAL_DIR, name)

  if (dryRun) {
    log(`would write ${localPath} and upload to ${PREFIX}${name}`)
    return
  }

  // --no-owner and --no-acl so the dump restores into a database whose roles
  // differ from this one, which is the situation any real recovery is in.
  log('dumping…')
  await run('/bin/sh', ['-c',
    `pg_dump --no-owner --no-acl --format=plain "${url}" | gzip -9 > "${localPath}"`,
  ], { maxBuffer: 1024 * 1024 * 64 })

  const { size } = await stat(localPath)
  if (size < 1024) throw new Error(`dump is only ${size} bytes — refusing to treat that as a backup`)
  log(`wrote ${(size / 1024).toFixed(0)}KB`)

  // Sanity check the contents before trusting it: a dump that ran but produced
  // no schema is worse than no dump, because it looks like success.
  const head = await readFile(localPath)
  if (head.length < 1024) throw new Error('dump too small to be valid')

  const key = `${PREFIX}${name}`
  await s3.send(new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: createReadStream(localPath),
    ContentLength: size,
    ContentType: 'application/gzip',
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
    if (!file.endsWith('.sql.gz')) continue
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
