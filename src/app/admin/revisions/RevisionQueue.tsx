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
 * Every field starts undecided and nothing can be applied until each one has
 * been accepted or refused. Defaulting to accepted made the queue a formality:
 * the footer read "2 of 2 accepted" before the reviewer had looked at anything,
 * so the path of least resistance was applying an unread proposal, which is the
 * opposite of what a review queue is for.
 *
 * Refusing asks for a reason, because "no" without one is not something the
 * next person can act on, and it is what a later re-proposal gets judged
 * against.
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

/** The domain a citation points at, for the reviewer to weigh at a glance. */
function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return 'source'
  }
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

  /**
   * Decisions, keyed by revision then field. A field absent from the map is
   * undecided, which is the state everything starts in.
   */
  const [decisions, setDecisions] = useState<
    Record<string, Record<string, { verdict: 'accept' | 'refuse'; reason: string }>>
  >({})

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

  const decide = (revisionId: string, field: string, verdict: 'accept' | 'refuse') => {
    setDecisions(prev => {
      const forRevision = { ...(prev[revisionId] ?? {}) }
      // Clicking the current verdict again returns the field to undecided,
      // so a misclick does not have to be corrected by choosing the opposite.
      if (forRevision[field]?.verdict === verdict) delete forRevision[field]
      else forRevision[field] = { verdict, reason: forRevision[field]?.reason ?? '' }
      return { ...prev, [revisionId]: forRevision }
    })
  }

  const setReason = (revisionId: string, field: string, reason: string) => {
    setDecisions(prev => ({
      ...prev,
      [revisionId]: {
        ...(prev[revisionId] ?? {}),
        [field]: { verdict: 'refuse', reason },
      },
    }))
  }

  const submit = async (revision: Revision) => {
    const made = decisions[revision.id] ?? {}

    const undecided = revision.fields.filter(f => !made[f.field])
    if (undecided.length > 0) {
      toast(`Decide on ${undecided.map(f => f.label.toLowerCase()).join(', ')} first`, 'error')
      return
    }

    const reject: Record<string, string> = {}
    for (const [field, d] of Object.entries(made)) {
      if (d.verdict === 'refuse') reject[field] = d.reason
    }

    const missingReason = Object.entries(reject).find(([, reason]) => !reason.trim())
    if (missingReason) {
      toast('Say why a field is being refused, so the next person can act on it', 'error')
      return
    }

    const approve = Object.entries(made)
      .filter(([, d]) => d.verdict === 'accept')
      .map(([field]) => field)

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
        const made = decisions[revision.id] ?? {}
        const acceptCount = Object.values(made).filter(d => d.verdict === 'accept').length
        const decidedCount = Object.keys(made).length
        const allDecided = decidedCount === revision.fields.length

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
                const verdict = made[f.field]?.verdict
                const isRefused = verdict === 'refuse'
                return (
                  <div key={f.field} className="px-4 py-3">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="text-xs uppercase tracking-wide text-neutral-500">{f.label}</span>
                      <span className="flex gap-3">
                        <button
                          onClick={() => decide(revision.id, f.field, 'accept')}
                          className={`text-xs uppercase tracking-wide ${
                            verdict === 'accept' ? 'text-green-400' : 'text-neutral-500 hover:text-white'
                          }`}
                        >
                          {verdict === 'accept' ? 'Accepted' : 'Accept'}
                        </button>
                        <button
                          onClick={() => decide(revision.id, f.field, 'refuse')}
                          className={`text-xs uppercase tracking-wide ${
                            isRefused ? 'text-[#ff8a80]' : 'text-neutral-500 hover:text-white'
                          }`}
                        >
                          {isRefused ? 'Refused' : 'Refuse'}
                        </button>
                      </span>
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
                          {/* The domain, not the word "source". Seeing at a
                              glance that a specification came from a wiki
                              rather than a manufacturer is most of what tells a
                              reviewer how hard to look at it. */}
                          {hostOf(f.sourceUrl)}
                        </a>
                      ) : f.uncited ? (
                        <span className="text-[#ff8a80]">no source given</span>
                      ) : null}
                    </p>

                    {isRefused && (
                      <input
                        value={made[f.field]?.reason ?? ''}
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
                {allDecided
                  ? `${acceptCount} of ${revision.fields.length} accepted`
                  : `${revision.fields.length - decidedCount} still to decide`}
              </p>
              <button
                onClick={() => submit(revision)}
                disabled={busy === revision.id || !allDecided}
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
