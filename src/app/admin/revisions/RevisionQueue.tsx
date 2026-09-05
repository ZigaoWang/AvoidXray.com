'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { apiErrorMessage } from '@/lib/apiError'
import { useToast } from '@/components/ui/Toast'
import { textLinkClass } from '@/components/ui/TextLink'

/**
 * Working through proposed changes.
 *
 * Built for a batch rather than a single item, because that is the shape the
 * work actually arrives in: a generated pass produces dozens of proposals at
 * once, most of them correct, and reviewing them one screen at a time is the
 * thing that decides whether the pass is usable at all.
 *
 * Every field starts accepted. The common case is that a proposal is right, so
 * the reviewer's work is finding the exceptions rather than confirming the
 * rest. Refusing a field asks for a reason, because "no" without one is not
 * something the next person can act on.
 */

interface Field {
  field: string
  label: string
  current: string
  proposed: string
  sourceUrl: string | null
  uncited: boolean
}

interface Revision {
  id: string
  entityType: string
  entityId: string | null
  entityName: string
  source: string
  submittedBy: string | null
  submittedAt: string
  stale: boolean
  fields: Field[]
  priorRejections: Array<{ field: string; reason: string; at: string | null }>
}

/** How a proposal's origin reads. The wording matters more than the code. */
const SOURCE_LABEL: Record<string, string> = {
  USER: 'Suggested by a contributor',
  ADMIN: 'Admin edit',
  LLM: 'Proposed automatically',
  RESEARCH: 'From research',
  DATASHEET: 'From a datasheet',
  IMPORT: 'Imported',
}

export default function RevisionQueue() {
  const { toast } = useToast()
  const [revisions, setRevisions] = useState<Revision[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)

  /** Field decisions, keyed by revision then field. Absent means accepted. */
  const [refused, setRefused] = useState<Record<string, Record<string, string>>>({})

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/revisions')
      if (!res.ok) {
        toast(await apiErrorMessage(res, 'Could not load the queue'), 'error')
        return
      }
      const data = await res.json()
      setRevisions(data.revisions ?? [])
    } catch {
      toast('Could not reach the server', 'error')
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => { load() }, [load])

  const toggleRefuse = (revisionId: string, field: string) => {
    setRefused(prev => {
      const forRevision = { ...(prev[revisionId] ?? {}) }
      if (field in forRevision) delete forRevision[field]
      else forRevision[field] = ''
      return { ...prev, [revisionId]: forRevision }
    })
  }

  const setReason = (revisionId: string, field: string, reason: string) => {
    setRefused(prev => ({
      ...prev,
      [revisionId]: { ...(prev[revisionId] ?? {}), [field]: reason },
    }))
  }

  const decide = async (revision: Revision) => {
    const reject = refused[revision.id] ?? {}
    const missingReason = Object.entries(reject).find(([, reason]) => !reason.trim())
    if (missingReason) {
      toast('Say why a field is being refused, so the next person can act on it', 'error')
      return
    }

    const approve = revision.fields.map(f => f.field).filter(f => !(f in reject))

    setBusy(revision.id)
    try {
      const res = await fetch(`/api/admin/revisions/${revision.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approve, reject }),
      })
      if (!res.ok) {
        toast(await apiErrorMessage(res, 'Could not save that decision'), 'error')
        return
      }
      const result = await res.json()
      const applied = result.applied?.length ?? 0
      const refusedCount = result.rejected?.length ?? 0
      toast(
        applied === 0
          ? 'Nothing applied'
          : `${applied} field${applied === 1 ? '' : 's'} applied` +
            (refusedCount ? `, ${refusedCount} refused` : ''),
        'success'
      )
      setRevisions(prev => prev.filter(r => r.id !== revision.id))
    } catch {
      toast('Could not reach the server', 'error')
    } finally {
      setBusy(null)
    }
  }

  if (loading) {
    return <p className="text-neutral-600 text-sm">Loading…</p>
  }

  if (revisions.length === 0) {
    return (
      <div className="border border-dashed border-neutral-800 px-4 py-12 text-center">
        <p className="text-neutral-500 text-sm">Nothing waiting.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {revisions.map(revision => {
        const reject = refused[revision.id] ?? {}
        const acceptCount = revision.fields.filter(f => !(f.field in reject)).length

        return (
          <article key={revision.id} className="border border-neutral-800 bg-neutral-900">
            <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-neutral-800 px-4 py-3">
              <div>
                <h2 className="text-sm font-bold text-white">
                  {revision.entityId ? (
                    <Link
                      href={`/${revision.entityType === 'FILM_STOCK' ? 'films' : 'cameras'}/${revision.entityId}`}
                      target="_blank"
                      className={textLinkClass}
                    >
                      {revision.entityName}
                    </Link>
                  ) : revision.entityName}
                </h2>
                <p className="mt-0.5 text-xs text-neutral-500">
                  {SOURCE_LABEL[revision.source] ?? revision.source}
                  {revision.submittedBy && ` · @${revision.submittedBy}`}
                </p>
              </div>
              {revision.stale && (
                <p className="text-xs text-[#ff8a80]">
                  This record changed after the proposal was drafted. Check before accepting.
                </p>
              )}
            </header>

            {revision.priorRejections.length > 0 && (
              <div className="border-b border-neutral-800 px-4 py-2">
                <p className="text-[11px] text-neutral-500">
                  Refused here before:{' '}
                  {revision.priorRejections.slice(0, 3).map((p, i) => (
                    <span key={i} className="text-neutral-400">
                      {i > 0 && '; '}
                      {p.field} ({p.reason})
                    </span>
                  ))}
                </p>
              </div>
            )}

            <div className="divide-y divide-neutral-900">
              {revision.fields.map(f => {
                const isRefused = f.field in reject
                return (
                  <div key={f.field} className="px-4 py-3">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="text-xs uppercase tracking-wide text-neutral-500">{f.label}</span>
                      <button
                        onClick={() => toggleRefuse(revision.id, f.field)}
                        className={`text-xs uppercase tracking-wide ${
                          isRefused ? 'text-[#ff8a80]' : 'text-neutral-500 hover:text-white'
                        }`}
                      >
                        {isRefused ? 'Refused' : 'Refuse'}
                      </button>
                    </div>

                    <div className={`mt-1 grid gap-1 sm:grid-cols-2 ${isRefused ? 'opacity-40' : ''}`}>
                      <p className="text-sm text-neutral-500 line-through decoration-neutral-700">
                        {f.current || 'Not set'}
                      </p>
                      <p className="text-sm text-neutral-200">{f.proposed || 'Cleared'}</p>
                    </div>

                    <p className="mt-1 text-[11px]">
                      {f.sourceUrl ? (
                        <a
                          href={f.sourceUrl}
                          target="_blank"
                          rel="noopener noreferrer nofollow"
                          className="text-neutral-500 underline decoration-neutral-700 underline-offset-2 hover:text-neutral-300"
                        >
                          source
                        </a>
                      ) : f.uncited ? (
                        <span className="text-[#ff8a80]">no source given</span>
                      ) : null}
                    </p>

                    {isRefused && (
                      <input
                        value={reject[f.field]}
                        onChange={e => setReason(revision.id, f.field, e.target.value)}
                        placeholder="Why is this wrong? The next person reads this."
                        className="mt-2 w-full border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm
                                   text-white placeholder:text-neutral-700 focus:border-neutral-600 focus:outline-none"
                      />
                    )}
                  </div>
                )
              })}
            </div>

            <footer className="flex items-center justify-between border-t border-neutral-800 px-4 py-3">
              <p className="text-xs text-neutral-500">
                {acceptCount} of {revision.fields.length} accepted
              </p>
              <button
                onClick={() => decide(revision)}
                disabled={busy === revision.id}
                className="h-9 bg-[#D32F2F] px-4 text-xs font-bold uppercase tracking-wide text-white
                           hover:bg-[#B71C1C] disabled:opacity-40"
              >
                {busy === revision.id ? 'Saving…' : 'Apply decision'}
              </button>
            </footer>
          </article>
        )
      })}
    </div>
  )
}
