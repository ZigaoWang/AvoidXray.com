'use client'

import { useCallback, useEffect, useState } from 'react'
import PageShell from '@/components/PageShell'
import Badge from '@/components/ui/Badge'
import Button, { buttonClass } from '@/components/ui/Button'
import EmptyState from '@/components/ui/EmptyState'
import PageHeader from '@/components/ui/PageHeader'
import SectionError from '@/components/ui/SectionError'
import { fetchJson } from '@/lib/fetchJson'
import { formatBytes } from '@/lib/formatBytes'
import { formatDate } from '@/lib/formatDate'
import { EXPORT_DAYS, LIBRARY_EXPORT_DAYS } from '@/lib/library/exportRules'
import type { ExportView } from '@/lib/library/exports'
import LibraryTabs from '../LibraryTabs'
import { useExportOriginals } from '@/components/useExportOriginals'

interface Answer {
  exports: ExportView[]
  library: { ok: boolean; reason: string | null; nextAt: string | null }
}

const SCOPE: Record<ExportView['scope'], string> = { library: 'Whole library', roll: 'Roll', album: 'Album', selection: 'Selection' }
/** How often the page asks again while something is being built. */
const POLL_MS = 5000

async function fetchExports(): Promise<Answer | { error: string }> {
  try {
    return await fetchJson<Answer>('/api/library/exports', { fallback: 'Could not load your exports' })
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Could not load your exports' }
  }
}

/**
 * The library's exports of original files: the ones being built and the ones
 * ready to download, with their parts, until they expire. Exports of a roll,
 * an album or a selection start from those; the whole library starts here.
 */
export default function ExportsClient({ header }: { header: React.ReactNode }) {
  const [data, setData] = useState<Answer | null>(null)
  const [error, setError] = useState<string | null>(null)
  const originals = useExportOriginals()

  const apply = useCallback((result: Awaited<ReturnType<typeof fetchExports>>) => {
    if ('error' in result) { setError(result.error); return }
    setError(null)
    setData(result)
  }, [])
  const load = useCallback(() => fetchExports().then(apply), [apply])
  useEffect(() => { void fetchExports().then(apply) }, [apply])
  const building = data?.exports.some(e => e.state === 'queued' || e.state === 'building')
  useEffect(() => {
    if (!building) return
    const timer = setInterval(() => void fetchExports().then(apply), POLL_MS)
    return () => clearInterval(timer)
  }, [building, apply])

  const exportLibrary = async () => {
    await originals.start({ scope: 'library' })
    await load()
  }

  return (
    <PageShell header={header}>
      <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-7xl flex-1 px-6 py-10 md:py-16">
        <PageHeader
          title="Exports"
          description={`Your originals exactly as uploaded, one folder per roll, with each photo's details in photos.csv and photos.json. Large exports are built on the server in parts of up to 4 GB; their links work for ${EXPORT_DAYS} days.`}
          action={data && (
            <Button onClick={() => void exportLibrary()} disabled={!data.library.ok || originals.busy}>Export whole library</Button>
          )}
        />
        <LibraryTabs current="exports" />

        {data && !data.library.ok && data.library.reason && (
          <p className="mb-6 text-sm text-neutral-400">
            {data.library.reason}
            {data.library.nextAt && ` You can start the next one on ${formatDate(data.library.nextAt)}.`}
          </p>
        )}
        {error && <SectionError className="py-6" message={error} onRetry={() => void load()} />}
        {data?.exports.length === 0 && (
          <EmptyState
            message="No exports yet"
            hint={`Export your whole library from here, once every ${LIBRARY_EXPORT_DAYS} days. To export a roll, an album or a selection, use Download originals in its menu.`}
          />
        )}
        {data && data.exports.length > 0 && (
          <ul className="divide-y divide-neutral-800 border-y border-neutral-800">
            {data.exports.map(e => <ExportRow key={e.id} e={e} />)}
          </ul>
        )}
      </main>
      {originals.dialog}
    </PageShell>
  )
}

function ExportRow({ e }: { e: ExportView }) {
  const plural = (n: number, word: string) => `${n.toLocaleString()} ${word}${n === 1 ? '' : 's'}`
  return (
    <li className="py-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="text-base font-bold text-white">
          {e.scope === 'library' ? 'Whole library' : e.title}
          {e.scope !== 'library' && <span className="ml-2 text-sm font-normal text-neutral-500">{SCOPE[e.scope]}</span>}
        </h2>
        <p className="text-sm text-neutral-500">
          {plural(e.photos, 'photo')} · asked for {formatDate(e.createdAt)}
        </p>
      </div>

      {e.state === 'queued' && <p className="mt-2 text-sm text-neutral-400">Waiting to start.</p>}
      {e.state === 'building' && (
        <div className="mt-3 max-w-md">
          <p className="text-sm text-neutral-400">Building: {e.done.toLocaleString()} of {plural(e.photos, 'photo')}</p>
          <div className="mt-2 h-1 bg-neutral-800" role="progressbar" aria-valuemin={0} aria-valuemax={e.photos} aria-valuenow={e.done}>
            <div className="h-full bg-brand transition-[width]" style={{ width: `${(100 * e.done) / Math.max(1, e.photos)}%` }} />
          </div>
        </div>
      )}
      {e.state === 'ready' && (
        <>
          <ul className="mt-3 flex flex-wrap gap-2">
            {e.parts.map(p => (
              <li key={p.number}>
                <a href={`/api/library/exports/${e.id}/parts/${p.number}`} className={buttonClass('outline', 'sm')} download>
                  {e.parts.length > 1 ? `Part ${p.number} of ${e.parts.length}` : 'Download'} · {formatBytes(p.bytes)}
                </a>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-sm text-neutral-500">
            {formatBytes(e.bytes)}{e.expiresAt && ` · links work until ${formatDate(e.expiresAt)}`}
          </p>
          {e.skipped > 0 && (
            <p className="mt-1 text-sm text-neutral-400">{plural(e.skipped, 'original')} could not be read and {e.skipped === 1 ? 'is' : 'are'} listed as missing in photos.csv.</p>
          )}
        </>
      )}
      {e.state === 'failed' && (
        <p className="mt-2 text-sm text-neutral-400"><Badge tone="warning">Failed</Badge> <span className="ml-1">This export could not be built. Start it again from where you asked for it.</span></p>
      )}
      {e.state === 'expired' && <p className="mt-2 text-sm text-neutral-500">Expired{e.expiresAt && ` on ${formatDate(e.expiresAt)}`}; the files have been deleted.</p>}
    </li>
  )
}
