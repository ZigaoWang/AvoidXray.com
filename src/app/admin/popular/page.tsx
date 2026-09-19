import Link from 'next/link'
import { readPopularity, popularityPath, type Ranked } from '@/lib/analytics/popularity'

/**
 * What gets read the most, from the server's own access log.
 *
 * Separate from /admin/analytics on purpose. That screen is Umami, and knows
 * about sessions, bounce rate and referrers from the day it was installed. This
 * one is the nginx log, which reaches back to February and counts visitors
 * Umami cannot see, but knows nothing beyond "this page was served". Two
 * sources answering two different questions, rather than one screen implying
 * they are the same number.
 *
 * Access is settled by the admin layout.
 */

const nf = new Intl.NumberFormat('en-US')

/**
 * Ranked by distinct addresses, not requests.
 *
 * Both are shown, because the gap is informative: a photograph with 300 views
 * from 8 addresses is one person returning, and a photograph with 300 views
 * from 250 addresses is an audience. Sorting on the second avoids handing the
 * top of every list to whoever refreshes most.
 */
function Table({ title, rows, empty }: { title: string; rows: Ranked[]; empty: string }) {
  const top = rows[0]?.visitors ?? 1

  return (
    <section className="border border-neutral-900 bg-neutral-950">
      <h2 className="px-4 py-2.5 text-[10px] uppercase tracking-wider text-neutral-500 border-b border-neutral-900 flex justify-between">
        <span>{title}</span>
        <span className="text-neutral-700">visitors / views</span>
      </h2>
      {rows.length === 0 ? (
        <p className="px-4 py-6 text-sm text-neutral-600">{empty}</p>
      ) : (
        <ol className="divide-y divide-neutral-900/70">
          {rows.map((row, i) => (
            <li key={row.key} className="relative">
              <div
                aria-hidden
                className="absolute inset-y-0 left-0 bg-neutral-900/50"
                style={{ width: `${Math.max(2, (row.visitors / top) * 100)}%` }}
              />
              <Link
                href={row.href}
                className="relative flex items-center gap-3 px-4 py-2 hover:bg-neutral-900/60 transition-colors"
              >
                <span className="text-[10px] text-neutral-700 tabular-nums w-4 shrink-0">
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm text-neutral-200 truncate">{row.label}</span>
                  {row.sublabel && (
                    <span className="block text-xs text-neutral-600 truncate">{row.sublabel}</span>
                  )}
                </span>
                <span className="text-sm text-neutral-400 tabular-nums shrink-0">
                  {nf.format(row.visitors)}
                  <span className="text-neutral-700 ml-2">{nf.format(row.views)}</span>
                </span>
              </Link>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}

export default async function PopularPage() {
  const report = await readPopularity()

  if (!report) {
    return (
      <div className="max-w-2xl">
        <h1 className="text-2xl font-display font-bold text-white mb-3">Popular</h1>
        <p className="text-sm text-neutral-400">
          No report has been generated yet. It is built from the nginx access log on the server:
        </p>
        <pre className="mt-3 text-xs text-neutral-500 bg-neutral-950 border border-neutral-900 p-3 overflow-x-auto">
          npx tsx scripts/build-popularity.ts
        </pre>
        <p className="text-xs text-neutral-600 mt-2">
          It writes to <code>{popularityPath}</code> and runs nightly by cron.
        </p>
      </div>
    )
  }

  const window =
    report.from && report.to
      ? `${report.from.slice(0, 11).replace(/\//g, ' ')} to ${report.to.slice(0, 11).replace(/\//g, ' ')}`
      : 'unknown range'

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-display font-bold text-white">Popular</h1>
        <p className="text-sm text-neutral-500 mt-1">
          {nf.format(report.totals.people)} people opened a photograph, film, camera or profile,
          {' '}{window}. Read from {nf.format(report.totals.lines)} log lines.
        </p>
      </div>

      <div className="grid lg:grid-cols-2 gap-3">
        <Table
          title="Photographs"
          rows={report.photos}
          empty="No photo pages served to a human yet."
        />
        <Table title="Film stocks" rows={report.films} empty="No film pages served yet." />
        <Table title="Cameras" rows={report.cameras} empty="No camera pages served yet." />
        <Table title="Profiles" rows={report.users} empty="No profile pages served yet." />
      </div>

      <p className="text-xs text-neutral-600">
        Counted from <code>{report.source}</code>, successful page loads only, with crawlers and
        scanners filtered out. Ranked by distinct addresses rather than requests, so one person
        reloading does not outrank a real audience. Generated{' '}
        {new Date(report.generatedAt).toLocaleString('en-US', { timeZone: 'UTC' })} UTC. For
        sessions, bounce rate and referrers, see <Link href="/admin/analytics" className="underline hover:text-neutral-400">Analytics</Link>.
      </p>
    </div>
  )
}
