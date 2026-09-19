/**
 * What people actually look at, counted from the nginx access log.
 *
 * The database knows what exists and what has been liked; it does not know what
 * is read. There is no view counter on Photo, and adding one would mean a write
 * on every page render for a number nobody needs to be exact. The access log
 * already holds the answer, going back to February, so this reads it there.
 *
 * Preferred over the Umami numbers for this particular question. Umami only
 * knows what it has collected since it was installed, and it only sees visitors
 * who run its script, which excludes anyone with an ad blocker or JavaScript
 * off. For "which photograph is most looked at", the server's own log is both
 * longer and more complete. Umami remains the better source for sessions,
 * bounce rate and referrers, which a log cannot tell you.
 *
 * Ranked by distinct addresses rather than by request count, so one person
 * refreshing a page thirty times does not outrank thirty people reading it.
 *
 *   npx tsx scripts/build-popularity.ts            # write the report
 *   npx tsx scripts/build-popularity.ts --dry      # print, write nothing
 *
 * Run on the server, where the log and the database both are. Cheap enough to
 * run nightly: about five seconds over a million lines.
 */

import fs from 'node:fs'
import path from 'node:path'
import readline from 'node:readline'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const LOG = process.env.POPULARITY_LOG || '/www/wwwlogs/avoidxray_com.log'
const OUT = process.env.POPULARITY_FILE || '/var/lib/avoidxray/popularity.json'
const DRY = process.argv.includes('--dry')

/** ip, [time], "METHOD path proto", status, and the user agent at the end. */
const LINE = /^(\S+) \S+ \S+ \[([^\]]+)\] "\S+ (\S+)[^"]*" (\d{3})/
const AGENT = /"([^"]*)"\s*$/

/**
 * Anything that is not a person.
 *
 * Deliberately broad. Over-matching costs a few real visitors at the margin;
 * under-matching puts Googlebot at the top of every list, and this ranking is
 * only worth having if it reflects people.
 */
const BOT =
  /bot|crawl|spider|slurp|yandex|baidu|sogou|censys|leakix|l9scan|scan|monitor|curl|wget|python|go-http|java\/|libwww|headless|okhttp|apache-http|axios|node-fetch|zgrab|masscan|semrush|ahrefs|mj12|dotbot|petal|bytespider|dataprovider|expanse|internetmeasurement|paloalto|netsystems|cdnunion|libredtail/i

type Tally = { views: number; visitors: Set<string> }
type Bucket = Map<string, Tally>

function bump(bucket: Bucket, key: string, ip: string) {
  let t = bucket.get(key)
  if (!t) bucket.set(key, (t = { views: 0, visitors: new Set() }))
  t.views++
  t.visitors.add(ip)
}

export type Ranked = {
  key: string
  label: string
  sublabel: string | null
  href: string
  views: number
  visitors: number
}

export type PopularityReport = {
  generatedAt: string
  /** Where the counts came from, so the page can say so honestly. */
  source: string
  from: string | null
  to: string | null
  totals: { lines: number; people: number }
  photos: Ranked[]
  films: Ranked[]
  cameras: Ranked[]
  users: Ranked[]
}

function rank(bucket: Bucket, limit: number): [string, Tally][] {
  return [...bucket.entries()]
    .sort((a, b) => b[1].visitors.size - a[1].visitors.size || b[1].views - a[1].views)
    .slice(0, limit)
}

async function main() {
  // Usernames first: a profile lives at the site root, so /explore and /kodak
  // are the same shape and only the database can tell them apart.
  const users = await prisma.user.findMany({ select: { username: true, name: true } })
  const usernames = new Map(users.map(u => [u.username.toLowerCase(), u]))

  const photos: Bucket = new Map()
  const films: Bucket = new Map()
  const cameras: Bucket = new Map()
  const profiles: Bucket = new Map()

  let lines = 0
  let first: string | null = null
  let last: string | null = null
  const people = new Set<string>()

  const rl = readline.createInterface({
    input: fs.createReadStream(LOG),
    crlfDelay: Infinity,
  })

  for await (const line of rl) {
    lines++
    const m = LINE.exec(line)
    if (!m) continue
    const [, ip, stamp, rawPath, status] = m
    // Only successful page loads. A 404 or a redirect is not a view, and
    // counting them would rank deleted photographs alongside live ones.
    if (status !== '200') continue

    const agent = (AGENT.exec(line) || ['', ''])[1]
    if (!agent || agent === '-' || BOT.test(agent)) continue

    // Next's own prefetches are not views.
    //
    // App Router <Link> fetches the RSC payload for a link as it scrolls into
    // the viewport, and that arrives as a GET for the page path carrying an
    // ?_rsc= marker. Scrolling the explore grid therefore requests every photo
    // on it without anybody opening one. Counting those put 120,316 phantom
    // views against 46,611 real page loads, and ranked photographs by how often
    // they had appeared in a grid rather than by how often they were read.
    const query = rawPath.includes('?') ? rawPath.slice(rawPath.indexOf('?')) : ''
    if (query.includes('_rsc=')) continue

    const p = rawPath.split('?')[0].replace(/\/+$/, '') || '/'
    if (!first) first = stamp
    last = stamp
    people.add(ip)

    let match: RegExpExecArray | null
    if ((match = /^\/photos\/([^/]+)$/.exec(p))) bump(photos, match[1], ip)
    else if ((match = /^\/films\/([^/]+)$/.exec(p))) bump(films, match[1], ip)
    else if ((match = /^\/cameras\/([^/]+)$/.exec(p))) bump(cameras, match[1], ip)
    else if ((match = /^\/([^/.]+)$/.exec(p))) {
      const user = usernames.get(match[1].toLowerCase())
      if (user) bump(profiles, user.username, ip)
    }
  }

  // Resolve the keys to things with names. Films and cameras appear under both
  // a cuid and a slug, because the site moved to slugs partway through the log,
  // so both forms are looked up and merged onto one row.
  const photoRows = await prisma.photo.findMany({
    where: { id: { in: rank(photos, 200).map(([k]) => k) } },
    select: {
      id: true,
      thumbnailPath: true,
      caption: true,
      user: { select: { username: true } },
      camera: { select: { name: true, brand: true } },
      filmStock: { select: { name: true, brand: true } },
    },
  })
  const photoById = new Map(photoRows.map(p => [p.id, p]))

  const filmKeys = rank(films, 200).map(([k]) => k)
  const filmRows = await prisma.filmStock.findMany({
    where: { OR: [{ id: { in: filmKeys } }, { slug: { in: filmKeys } }] },
    select: { id: true, slug: true, name: true, brand: true },
  })
  const cameraKeys = rank(cameras, 200).map(([k]) => k)
  const cameraRows = await prisma.camera.findMany({
    where: { OR: [{ id: { in: cameraKeys } }, { slug: { in: cameraKeys } }] },
    select: { id: true, slug: true, name: true, brand: true },
  })

  /** Merge the cuid and slug tallies for one entity into a single row. */
  function mergeBySlug(
    bucket: Bucket,
    rows: { id: string; slug: string | null; name: string; brand: string | null }[],
    base: string,
  ): Ranked[] {
    const out: Ranked[] = []
    for (const row of rows) {
      const keys = [row.id, row.slug].filter(Boolean) as string[]
      let views = 0
      const visitors = new Set<string>()
      for (const k of keys) {
        const t = bucket.get(k)
        if (!t) continue
        views += t.views
        for (const ip of t.visitors) visitors.add(ip)
      }
      if (views === 0) continue
      out.push({
        key: row.slug || row.id,
        label: row.name,
        sublabel: row.brand,
        href: `${base}/${row.slug || row.id}`,
        views,
        visitors: visitors.size,
      })
    }
    return out.sort((a, b) => b.visitors - a.visitors || b.views - a.views).slice(0, 15)
  }

  const report: PopularityReport = {
    generatedAt: new Date().toISOString(),
    source: path.basename(LOG),
    from: first,
    to: last,
    totals: { lines, people: people.size },
    photos: rank(photos, 200)
      .filter(([k]) => photoById.has(k))
      .slice(0, 15)
      .map(([k, t]) => {
        const row = photoById.get(k)!
        const gear = [row.camera?.name, row.filmStock?.name].filter(Boolean).join(' · ')
        return {
          key: k,
          label: row.caption?.slice(0, 60) || gear || 'Untitled',
          sublabel: row.user ? `@${row.user.username}` : null,
          href: `/photos/${k}`,
          views: t.views,
          visitors: t.visitors.size,
        }
      }),
    films: mergeBySlug(films, filmRows, '/films'),
    cameras: mergeBySlug(cameras, cameraRows, '/cameras'),
    users: rank(profiles, 15).map(([k, t]) => ({
      key: k,
      label: `@${k}`,
      sublabel: users.find(u => u.username === k)?.name ?? null,
      href: `/${k}`,
      views: t.views,
      visitors: t.visitors.size,
    })),
  }

  if (DRY) {
    console.log(JSON.stringify(report, null, 2).slice(0, 3000))
  } else {
    fs.mkdirSync(path.dirname(OUT), { recursive: true })
    // Written beside the target and moved into place, so the admin page never
    // reads a half-written file.
    fs.writeFileSync(`${OUT}.tmp`, JSON.stringify(report))
    fs.renameSync(`${OUT}.tmp`, OUT)
  }

  console.error(
    `[popularity] ${lines.toLocaleString()} lines, ${people.size.toLocaleString()} people, ` +
      `${report.photos.length} photos, ${report.films.length} films, ` +
      `${report.cameras.length} cameras, ${report.users.length} profiles` +
      (DRY ? ' (dry run)' : ` -> ${OUT}`),
  )
}

main()
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
