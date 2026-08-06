/**
 * Regression check: no public API route may return sensitive fields.
 *
 * This exists because the original fix was applied by hand and missed a second,
 * identical `include: { user: true }` a few lines further down the same file —
 * /api/photos?tab=recent kept leaking passwordHash after the "fix" shipped. A
 * recursive check over real responses catches that; reading the code did not.
 *
 * Routes are discovered by walking src/app/api, so a newly added endpoint is
 * covered without touching this file. Dynamic segments are filled from the
 * database, and routes needing auth are reported as skipped rather than passed,
 * so the output never overstates coverage.
 *
 *   npx tsx scripts/check-api-leaks.ts                    # against localhost:3000
 *   npx tsx scripts/check-api-leaks.ts https://avoidxray.com
 *
 * Exits non-zero if anything leaks.
 */

import { PrismaClient } from '@prisma/client'
import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const BASE = process.argv[2]?.replace(/\/$/, '') ?? 'http://localhost:3000'
const API_DIR = 'src/app/api'

/** Field names that must never appear anywhere in a public response body. */
const DENYLIST = new Set([
  'passwordhash',
  'password',
  'resettoken',
  'resettokenexpiry',
  'verificationtoken',
  'verificationtokenexpiry',
  'email',
  'accesstoken',
  'refreshtoken',
  'idtoken',
  'sessiontoken',
  'apikey',
  'secret',
])

/** Routes that are allowed to return an otherwise-denied field, with a reason. */
const ALLOWED: Record<string, Set<string>> = {
  // Registration echoes the address back to the person who just typed it.
  '/api/register': new Set(['email']),
}

function findRoutes(dir: string, prefix = '/api'): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      out.push(...findRoutes(full, `${prefix}/${entry}`))
    } else if (entry === 'route.ts') {
      out.push(prefix)
    }
  }
  return out
}

/** Walk any JSON shape and collect the paths of denied keys. */
function findSensitive(value: unknown, path = '', found: string[] = []): string[] {
  if (Array.isArray(value)) {
    // A few elements is enough; responses are homogeneous.
    value.slice(0, 5).forEach((v, i) => findSensitive(v, `${path}[${i}]`, found))
  } else if (value && typeof value === 'object') {
    for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
      if (DENYLIST.has(key.toLowerCase())) found.push(`${path}.${key}`)
      findSensitive(v, `${path}.${key}`, found)
    }
  }
  return found
}

async function sampleIds(prisma: PrismaClient) {
  const [photo, camera, film, user, note] = await Promise.all([
    prisma.photo.findFirst({ where: { published: true }, select: { id: true } }),
    prisma.camera.findFirst({ select: { id: true, slug: true } }),
    prisma.filmStock.findFirst({ select: { id: true, slug: true } }),
    prisma.user.findFirst({ select: { username: true } }),
    prisma.communityNote.findFirst({ select: { id: true } }).catch(() => null),
  ])
  return {
    '[id]': photo?.id ?? '1',
    '[photoId]': photo?.id ?? '1',
    '[username]': user?.username ?? 'unknown',
    '[shard]': '0',
    __camera: camera?.id ?? '1',
    __film: film?.id ?? '1',
    __note: note?.id ?? '1',
  }
}

function expand(route: string, ids: Awaited<ReturnType<typeof sampleIds>>): string | null {
  if (route.includes('[...')) return null // catch-all (NextAuth) — not a data route
  if (route.startsWith('/api/admin')) return null // admin-gated, covered by auth

  let url = route
  if (route.startsWith('/api/cameras/')) url = url.replace('[id]', ids.__camera)
  else if (route.startsWith('/api/filmstocks/')) url = url.replace('[id]', ids.__film)
  else if (route.startsWith('/api/community-notes/')) url = url.replace('[id]', ids.__note)

  for (const [token, value] of Object.entries(ids)) {
    if (token.startsWith('__')) continue
    url = url.replace(token, value)
  }
  if (url.includes('[')) return null

  // Query strings the route needs to return a body at all.
  if (url === '/api/photos') return `${url}?tab=recent&limit=3`
  if (url === '/api/search') return `${url}?q=kodak`
  if (url === '/api/community-notes') return `${url}?targetType=filmstock&targetId=${ids.__film}`
  return url
}

async function main() {
  const prisma = new PrismaClient()
  const ids = await sampleIds(prisma)
  await prisma.$disconnect()

  const routes = findRoutes(API_DIR).sort()
  let leaked = 0
  let checked = 0
  const skipped: string[] = []

  console.log(`\nChecking ${routes.length} API routes against ${BASE}\n`)

  for (const route of routes) {
    const url = expand(route, ids)
    if (!url) {
      skipped.push(`${route} (not addressable)`)
      continue
    }

    let res: Response
    try {
      res = await fetch(BASE + url, { headers: { 'User-Agent': 'leak-check' } })
    } catch (err) {
      skipped.push(`${route} (${(err as Error).message})`)
      continue
    }

    if (res.status === 401 || res.status === 403) {
      skipped.push(`${route} (${res.status} auth-gated)`)
      continue
    }

    const text = await res.text()
    let body: unknown
    try {
      body = JSON.parse(text)
    } catch {
      skipped.push(`${route} (non-JSON ${res.status})`)
      continue
    }

    checked++
    const allowed = ALLOWED[route] ?? new Set<string>()
    const hits = findSensitive(body).filter(
      (h) => !allowed.has(h.split('.').pop()!.toLowerCase())
    )

    if (hits.length > 0) {
      leaked++
      console.log(`  LEAK  ${url}`)
      for (const h of [...new Set(hits)].slice(0, 8)) console.log(`          ${h}`)
    } else {
      console.log(`  ok    ${url}`)
    }
  }

  if (skipped.length > 0) {
    console.log(`\nSkipped ${skipped.length} (not asserted clean):`)
    for (const s of skipped) console.log(`  - ${s}`)
  }

  console.log(`\n${checked} checked, ${leaked} leaking\n`)
  process.exit(leaked > 0 ? 1 : 0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
