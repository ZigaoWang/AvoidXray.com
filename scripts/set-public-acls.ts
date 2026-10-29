/**
 * Sets public-read, explicitly, on every object a public page loads, so the
 * bucket's own default can be private (docs/operations.md, "Then the bucket's
 * own default").
 *
 * The objects are the ones the database names: display versions of photos
 * whose files are public, every archive version, avatars, camera and film
 * stock images, and moderation images (an approved one is served as the
 * catalog image). Originals, the display versions of private photos and
 * backups are never touched.
 *
 * Each object's ACL is then read back with OSS's own API, which tells an
 * explicit public-read from one inherited from the bucket; the S3 API reports
 * both the same way. Anything not explicitly public-read is listed, and the
 * run fails.
 *
 * Writes nothing unless --yes is given; without it, it counts what it would
 * set and reads the current ACLs.
 *
 *   npx tsx scripts/set-public-acls.ts
 *   npx tsx scripts/set-public-acls.ts --yes
 */
import 'dotenv/config'
import { createHmac } from 'node:crypto'
import { PrismaClient } from '@prisma/client'
import { setObjectAccess } from '../src/lib/oss'

const prisma = new PrismaClient()
const bucket = process.env.ALIYUN_OSS_BUCKET!
const region = process.env.ALIYUN_OSS_REGION!
const CONCURRENCY = 16

/** An object's ACL as OSS states it: default, private, public-read or public-read-write. */
async function aclOf(key: string): Promise<string> {
  const date = new Date().toUTCString()
  const resource = `/${bucket}/${key}?acl`
  const signature = createHmac('sha1', process.env.ALIYUN_OSS_ACCESS_KEY_SECRET!)
    .update(`GET\n\n\n${date}\n${resource}`).digest('base64')
  const res = await fetch(`https://${bucket}.${region}.aliyuncs.com/${key.split('/').map(encodeURIComponent).join('/')}?acl`, {
    headers: { Date: date, Authorization: `OSS ${process.env.ALIYUN_OSS_ACCESS_KEY_ID}:${signature}` },
  })
  const body = await res.text()
  if (!res.ok) return res.status === 404 ? 'missing' : `error ${res.status}`
  return /<Grant>([^<]+)<\/Grant>/.exec(body)?.[1] ?? 'unknown'
}

async function referencedPublicKeys(): Promise<Map<string, string>> {
  const keys = new Map<string, string>()
  const add = (key: string | null | undefined, what: string) => { if (key) keys.set(key, what) }
  // Only addresses in this bucket: an avatar can be hosted elsewhere.
  const origin = `https://${bucket}.${region}.aliyuncs.com/`
  const fromUrl = (url: string | null | undefined) => (url?.startsWith(origin) ? decodeURIComponent(url.slice(origin.length)) : null)

  for (const p of await prisma.photo.findMany({
    where: { OR: [{ kind: 'ARCHIVE' }, { kind: 'COMMUNITY', imagesPublic: true }] },
    select: { kind: true, thumbKey: true, mediumKey: true, largeKey: true, archiveRecord: { select: { fullPath: true } } },
  })) {
    const what = p.kind === 'ARCHIVE' ? 'archive version' : 'display version'
    add(p.thumbKey, what); add(p.mediumKey, what); add(p.largeKey, what)
    add(fromUrl(p.archiveRecord?.fullPath), what)
  }
  for (const u of await prisma.user.findMany({ where: { avatar: { not: null } }, select: { avatar: true } })) add(fromUrl(u.avatar), 'avatar')
  for (const c of await prisma.camera.findMany({ where: { imageUrl: { not: null } }, select: { imageUrl: true } })) add(fromUrl(c.imageUrl), 'catalog image')
  for (const f of await prisma.filmStock.findMany({ where: { imageUrl: { not: null } }, select: { imageUrl: true } })) add(fromUrl(f.imageUrl), 'catalog image')
  for (const m of await prisma.moderationSubmission.findMany({ select: { originalImage: true, proposedImage: true } })) {
    add(fromUrl(m.originalImage), 'moderation image'); add(fromUrl(m.proposedImage), 'moderation image')
  }
  // Never these, whatever names them.
  for (const key of keys.keys()) if (/^(originals|backups)\//.test(key)) keys.delete(key)
  return keys
}

async function pool<T>(items: T[], run: (item: T) => Promise<void>) {
  let next = 0
  await Promise.all(Array.from({ length: CONCURRENCY }, async () => { while (next < items.length) await run(items[next++]) }))
}

async function main() {
  const write = process.argv.includes('--yes')
  const keys = await referencedPublicKeys()
  const byKind = new Map<string, number>()
  for (const what of keys.values()) byKind.set(what, (byKind.get(what) ?? 0) + 1)
  console.log(`${keys.size} objects referenced by public pages:`, Object.fromEntries(byKind))

  if (write) {
    let done = 0
    const failed: string[] = []
    await pool([...keys.keys()], async key => {
      try { await setObjectAccess(key, 'public') } catch (error) { failed.push(`${key}: ${(error as Error).name}`) }
      if (++done % 1000 === 0) console.log(`  ${done} of ${keys.size} set`)
    })
    if (failed.length) console.log(`could not set ${failed.length}:`, failed.slice(0, 20))
  }

  const tally = new Map<string, number>()
  const notExplicit: string[] = []
  await pool([...keys.keys()], async key => {
    const acl = await aclOf(key)
    tally.set(acl, (tally.get(acl) ?? 0) + 1)
    if (acl !== 'public-read' && acl !== 'missing') notExplicit.push(`${key} (${acl})`)
  })
  console.log('ACLs read back:', Object.fromEntries(tally))
  if (notExplicit.length) {
    console.log(`${notExplicit.length} not explicitly public-read, e.g.:`, notExplicit.slice(0, 10))
    if (write) process.exitCode = 1
  }
  if (!write) console.log('Dry run: nothing written. Run again with --yes.')
}

main().catch(error => { console.error(error); process.exitCode = 1 }).finally(() => prisma.$disconnect())
