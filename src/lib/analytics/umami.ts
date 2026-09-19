/**
 * Reads the site's own analytics back out of Umami.
 *
 * Umami runs on this same box, bound to loopback, and is deliberately not
 * published: no DNS record, no certificate. That shapes this client. Every call
 * goes to 127.0.0.1, so there is no TLS to configure and no public endpoint to
 * protect, and the API key never leaves the server because everything here runs
 * in a server component.
 *
 * Server only. Import it from a server component and nowhere else.
 *
 * The key is safe from the bundler by construction rather than by care: Next
 * inlines an environment variable into client code only when it is prefixed
 * NEXT_PUBLIC_, and UMAMI_API_KEY is not. The website id is prefixed, because
 * the tracker in the layout needs it in the browser, and it is public anyway.
 */

const BASE = process.env.UMAMI_URL || 'http://127.0.0.1:3001'
const KEY = process.env.UMAMI_API_KEY
const SITE = process.env.UMAMI_WEBSITE_ID || process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID

/** Configured at all. False on a laptop, and on any deploy without the key. */
export const analyticsConfigured = Boolean(KEY && SITE)

export type Summary = {
  pageviews: number
  visitors: number
  visits: number
  bounces: number
  totaltime: number
}

/** One row of a breakdown: a label and a count. */
export type Metric = { label: string; value: number }

/** A point in the daily series. */
export type Point = { date: string; pageviews: number; sessions: number }

export type Overview = {
  summary: Summary
  /** The same window immediately before this one, for a direction arrow. */
  previous: Summary | null
  series: Point[]
  countries: Metric[]
  pages: Metric[]
  referrers: Metric[]
  browsers: Metric[]
  devices: Metric[]
}

/**
 * How long to wait on Umami before giving up.
 *
 * It is a loopback call, so a slow answer means the process is wedged rather
 * than that the network is busy. The admin page renders on the server, so a
 * request with no ceiling would hold the whole page open rather than degrade a
 * panel on it. Short, because the honest failure is quick and visible.
 */
const TIMEOUT_MS = 4000

async function call<T>(path: string, params: Record<string, string | number>): Promise<T> {
  const url = new URL(`/api/websites/${SITE}${path}`, BASE)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v))

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${KEY}` },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    // Analytics are a dashboard, not a page the public reads. Caching them
    // would show a stale number to the one person who came to look at a fresh
    // one, which is the entire purpose of the screen.
    cache: 'no-store',
  })

  if (!response.ok) {
    throw new Error(`umami ${path} responded ${response.status}`)
  }
  return response.json() as Promise<T>
}

/** Umami's breakdowns come back as {x: label, y: count}. */
function toMetrics(rows: { x: string | null; y: number }[], limit: number): Metric[] {
  return rows
    .filter(r => r.y > 0)
    .slice(0, limit)
    .map(r => ({ label: r.x || 'unknown', value: r.y }))
}

/**
 * Everything the admin overview draws, in one round of requests.
 *
 * Issued together rather than in sequence: they are independent, they all go to
 * loopback, and serialising eight of them would make the page four times slower
 * for no reason. One failure fails the call, which is the behavior wanted here
 * because a panel showing five of eight numbers with no explanation is worse
 * than a page that says it could not reach Umami.
 */
export async function getOverview(days: number): Promise<Overview> {
  if (!analyticsConfigured) throw new Error('analytics not configured')

  const endAt = Date.now()
  const startAt = endAt - days * 86_400_000
  const window = { startAt, endAt }

  // Days for a month or less, months beyond that. A 90-day range drawn by day
  // is 90 bars in a panel a few hundred pixels wide, which is noise rather
  // than a trend.
  const unit = days <= 31 ? 'day' : 'month'

  const metric = (type: string) =>
    call<{ x: string | null; y: number }[]>('/metrics', { ...window, type, limit: 10 })

  const [stats, series, countries, pages, referrers, browsers, devices] = await Promise.all([
    call<Summary & { comparison?: Summary }>('/stats', window),
    call<{ pageviews: { x: string; y: number }[]; sessions: { x: string; y: number }[] }>(
      '/pageviews',
      { ...window, unit, timezone: 'UTC' },
    ),
    metric('country'),
    metric('path'),
    metric('referrer'),
    metric('browser'),
    metric('device'),
  ])

  const sessionsByDate = new Map(series.sessions.map(p => [p.x, p.y]))

  return {
    summary: {
      pageviews: stats.pageviews,
      visitors: stats.visitors,
      visits: stats.visits,
      bounces: stats.bounces,
      totaltime: stats.totaltime,
    },
    previous: stats.comparison ?? null,
    series: series.pageviews.map(p => ({
      date: p.x,
      pageviews: p.y,
      sessions: sessionsByDate.get(p.x) ?? 0,
    })),
    countries: toMetrics(countries, 8),
    pages: toMetrics(pages, 8),
    referrers: toMetrics(referrers, 6),
    browsers: toMetrics(browsers, 5),
    devices: toMetrics(devices, 4),
  }
}

/**
 * Bounce rate as a percentage of visits.
 *
 * Guarded against an empty window: a new install, or a quiet day, divides by
 * zero and renders "NaN%" on the dashboard.
 */
export function bounceRate({ bounces, visits }: Summary): number | null {
  return visits > 0 ? Math.round((bounces / visits) * 100) : null
}

/** Mean visit length, in seconds. Null when there is nothing to average. */
export function averageVisit({ totaltime, visits }: Summary): number | null {
  return visits > 0 ? Math.round(totaltime / visits) : null
}
