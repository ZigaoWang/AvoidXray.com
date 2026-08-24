import Link from 'next/link'
import { COLOR_BALANCES, FILM_PROCESSES } from '@/lib/filmFields'

/**
 * Browse filters for the film stock index.
 *
 * Links rather than a client component: the filter state belongs in the URL so
 * a filtered view can be shared, revisited and returned to with the back
 * button. It also keeps this page server-rendered.
 *
 * Process comes first and reads as the primary control — it is how people
 * actually narrow film, and the only field guaranteed to be present on every
 * stock. Colour balance is secondary and shown more quietly.
 */
export default function FilmFilters({
  process,
  balance,
  counts,
}: {
  process?: string
  balance?: string
  /** Stocks per process value, so an option that matches nothing can be hidden. */
  counts: { process: Record<string, number>; balance: Record<string, number> }
}) {
  const href = (next: { process?: string; balance?: string }) => {
    const params = new URLSearchParams()
    const p = next.process ?? process
    const b = next.balance ?? balance
    if (p) params.set('process', p)
    if (b) params.set('balance', b)
    const query = params.toString()
    return query ? `/films?${query}` : '/films'
  }

  const chip = (active: boolean) =>
    `text-xs px-3 py-1.5 border transition-colors ${
      active
        ? 'border-[#D32F2F] bg-[#D32F2F] text-white'
        : 'border-neutral-800 text-neutral-400 hover:border-neutral-600 hover:text-white'
    }`

  const availableProcesses = FILM_PROCESSES.filter((p) => counts.process[p] > 0)
  const availableBalances = COLOR_BALANCES.filter((b) => counts.balance[b] > 0)

  if (availableProcesses.length < 2 && availableBalances.length < 2) return null

  return (
    <div className="mb-10 space-y-3">
      {availableProcesses.length > 1 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs uppercase tracking-widest text-neutral-600 mr-1">Process</span>
          <Link href={href({ process: '' })} className={chip(!process)}>
            All
          </Link>
          {availableProcesses.map((value) => (
            <Link
              key={value}
              href={href({ process: process === value ? '' : value })}
              className={chip(process === value)}
            >
              {value}
              <span className={process === value ? 'ml-1.5 opacity-70' : 'ml-1.5 text-neutral-600'}>
                {counts.process[value]}
              </span>
            </Link>
          ))}
        </div>
      )}

      {availableBalances.length > 1 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs uppercase tracking-widest text-neutral-600 mr-1">Balance</span>
          <Link href={href({ balance: '' })} className={chip(!balance)}>
            All
          </Link>
          {availableBalances.map((value) => (
            <Link
              key={value}
              href={href({ balance: balance === value ? '' : value })}
              className={chip(balance === value)}
            >
              {value}
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
