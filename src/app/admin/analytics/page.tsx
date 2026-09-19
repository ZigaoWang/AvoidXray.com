import Link from 'next/link'
import {
  getOverview,
  bounceRate,
  averageVisit,
  analyticsConfigured,
  type Metric,
  type Overview,
} from '@/lib/analytics/umami'

/**
 * The site's own traffic, read from the Umami running beside it.
 *
 * Access is already settled by the admin layout, which redirects anyone who is
 * not an administrator, so there is no check here. Rendering on the server is
 * what keeps the API key out of the browser, and it also means the numbers
 * arrive with the page rather than after a spinner.
 *
 * Umami's own dashboard is richer than this and still exists, over an SSH
 * tunnel. This screen answers the questions worth having at a glance, in the
 * place the rest of the site is administered.
 */

/** Windows offered. Thirty is the default because a week is noisy at this volume. */
const RANGES = [
  { days: 7, label: '7 days' },
  { days: 30, label: '30 days' },
  { days: 90, label: '90 days' },
] as const

const nf = new Intl.NumberFormat('en-US')

function duration(seconds: number | null): string {
  if (seconds === null) return '—'
  if (seconds < 60) return `${seconds}s`
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`
}

/** Direction against the previous window of the same length. */
function Delta({ now, before }: { now: number; before: number | undefined }) {
  if (before === undefined || before === 0) return null
  const change = Math.round(((now - before) / before) * 100)
  if (change === 0) return <span className="text-neutral-600 text-xs">no change</span>
  const up = change > 0
  return (
    <span className={`text-xs tabular-nums ${up ? 'text-emerald-400' : 'text-neutral-500'}`}>
      {up ? '↑' : '↓'} {Math.abs(change)}%
    </span>
  )
}

function Tile({
  label,
  value,
  now,
  before,
}: {
  label: string
  value: string
  now?: number
  before?: number
}) {
  return (
    <div className="border border-neutral-900 bg-neutral-950 px-4 py-3">
      <p className="text-[10px] uppercase tracking-wider text-neutral-500">{label}</p>
      <p className="text-2xl font-display font-bold text-white tabular-nums mt-1">{value}</p>
      {now !== undefined && <Delta now={now} before={before} />}
    </div>
  )
}

/**
 * A breakdown as proportional bars.
 *
 * Widths are relative to the largest row rather than to the total: the top row
 * always fills the panel, which makes the shape of the distribution readable
 * even when one entry holds most of it. Percentages beside them are of the
 * total, so the absolute share is still stated rather than implied.
 */
function Breakdown({ title, rows, empty }: { title: string; rows: Metric[]; empty: string }) {
  const total = rows.reduce((sum, r) => sum + r.value, 0)
  const top = rows[0]?.value ?? 1

  return (
    <section className="border border-neutral-900 bg-neutral-950">
      <h2 className="px-4 py-2.5 text-[10px] uppercase tracking-wider text-neutral-500 border-b border-neutral-900">
        {title}
      </h2>
      {rows.length === 0 ? (
        <p className="px-4 py-6 text-sm text-neutral-600">{empty}</p>
      ) : (
        <ul className="divide-y divide-neutral-900/70">
          {rows.map(row => (
            <li key={row.label} className="relative px-4 py-2">
              <div
                aria-hidden
                className="absolute inset-y-0 left-0 bg-neutral-900/60"
                style={{ width: `${Math.max(2, (row.value / top) * 100)}%` }}
              />
              <div className="relative flex items-center justify-between gap-3 text-sm">
                <span className="text-neutral-300 truncate">{row.label}</span>
                <span className="text-neutral-500 tabular-nums shrink-0">
                  {nf.format(row.value)}
                  {total > 0 && (
                    <span className="text-neutral-700 ml-2">
                      {Math.round((row.value / total) * 100)}%
                    </span>
                  )}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/** The daily series, as bars. No chart library: this is one dimension over time. */
function Series({ series }: { series: Overview['series'] }) {
  const peak = Math.max(1, ...series.map(p => p.pageviews))

  return (
    <section className="border border-neutral-900 bg-neutral-950">
      <h2 className="px-4 py-2.5 text-[10px] uppercase tracking-wider text-neutral-500 border-b border-neutral-900">
        Pageviews over time
      </h2>
      {series.length === 0 ? (
        <p className="px-4 py-6 text-sm text-neutral-600">Nothing recorded in this window yet.</p>
      ) : (
        <div className="px-4 py-4 flex items-end gap-[3px] h-36">
          {series.map(point => {
            const date = new Date(point.date).toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              timeZone: 'UTC',
            })
            return (
              <div
                key={point.date}
                className="flex-1 min-w-[2px] bg-brand/70 hover:bg-brand transition-colors"
                style={{ height: `${Math.max(2, (point.pageviews / peak) * 100)}%` }}
                title={`${date}: ${nf.format(point.pageviews)} views, ${nf.format(point.sessions)} visits`}
              />
            )
          })}
        </div>
      )}
    </section>
  )
}

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>
}) {
  const { days: raw } = await searchParams
  const parsed = Number(raw)
  // Only the offered windows. A hand-edited ?days=100000 would otherwise ask
  // Umami to aggregate the whole table on every load of an admin page.
  const days = RANGES.some(r => r.days === parsed) ? parsed : 30

  if (!analyticsConfigured) {
    return (
      <div className="max-w-2xl">
        <h1 className="text-2xl font-display font-bold text-white mb-3">Analytics</h1>
        <p className="text-sm text-neutral-400">
          Not configured on this deploy. It needs <code className="text-neutral-300">UMAMI_API_KEY</code>{' '}
          and <code className="text-neutral-300">UMAMI_WEBSITE_ID</code> in the environment. See{' '}
          <code className="text-neutral-300">/opt/umami/README-deploy.md</code> on the server.
        </p>
      </div>
    )
  }

  let data: Overview
  try {
    data = await getOverview(days)
  } catch (error) {
    // Said plainly rather than thrown. Umami being down is an operational
    // detail of one panel; it should not take out the admin area, and the
    // person reading this is the one who can go and restart it.
    return (
      <div className="max-w-2xl">
        <h1 className="text-2xl font-display font-bold text-white mb-3">Analytics</h1>
        <p className="text-sm text-neutral-400">
          Could not reach Umami. It runs on this server under pm2 as{' '}
          <code className="text-neutral-300">umami</code>; check{' '}
          <code className="text-neutral-300">pm2 logs umami</code>.
        </p>
        <p className="text-xs text-neutral-600 mt-2 font-mono">
          {error instanceof Error ? error.message : String(error)}
        </p>
      </div>
    )
  }

  const { summary, previous } = data
  const rate = bounceRate(summary)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-display font-bold text-white">Analytics</h1>
        <nav aria-label="Date range" className="flex gap-1">
          {RANGES.map(r => (
            <Link
              key={r.days}
              href={`/admin/analytics?days=${r.days}`}
              aria-current={r.days === days ? 'page' : undefined}
              className={`px-3 py-1.5 text-xs border transition-colors ${
                r.days === days
                  ? 'text-white border-brand bg-neutral-900'
                  : 'text-neutral-400 border-neutral-900 hover:text-white hover:bg-neutral-900/60'
              }`}
            >
              {r.label}
            </Link>
          ))}
        </nav>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Tile
          label="Visitors"
          value={nf.format(summary.visitors)}
          now={summary.visitors}
          before={previous?.visitors}
        />
        <Tile
          label="Pageviews"
          value={nf.format(summary.pageviews)}
          now={summary.pageviews}
          before={previous?.pageviews}
        />
        <Tile label="Bounce rate" value={rate === null ? '—' : `${rate}%`} />
        <Tile label="Average visit" value={duration(averageVisit(summary))} />
      </div>

      <Series series={data.series} />

      <div className="grid md:grid-cols-2 gap-3">
        <Breakdown title="Countries" rows={data.countries} empty="No visits recorded yet." />
        <Breakdown title="Pages" rows={data.pages} empty="No pageviews recorded yet." />
        <Breakdown
          title="Referrers"
          rows={data.referrers}
          empty="Nothing has linked here in this window."
        />
        <Breakdown title="Browsers" rows={data.browsers} empty="No visits recorded yet." />
      </div>

      <p className="text-xs text-neutral-600">
        Collected by Umami on this server, first-party via <code>/s.js</code>. Bots are excluded by
        Umami, so these are lower and more honest than the raw nginx counts. The full dashboard,
        with sessions and funnels, is at <code>localhost:3001</code> over an SSH tunnel.
      </p>
    </div>
  )
}
