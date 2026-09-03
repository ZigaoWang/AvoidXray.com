'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { ADMIN_RESOURCES, VALUE_LABELS, displayValue, type ResourceName, type ResourceSpec } from '@/lib/admin/resources'
import { apiErrorMessage } from '@/lib/apiError'
import { useToast } from '@/components/ui/Toast'
import EditRecordModal from './EditRecordModal'
import { textLinkClass } from '@/components/ui/TextLink'
import { formatDate } from '@/lib/formatDate'

type Row = Record<string, unknown>

interface Props {
  resource: ResourceName
  /** Optional preset narrowing, offered as tabs above the table. */
  filters?: readonly { value: string; label: string }[]
}

const PAGE_SIZE = 25
/** Long enough that a fast typist sends one request, not one per keystroke. */
const SEARCH_DEBOUNCE_MS = 350

export default function ResourceTable({ resource, filters }: Props) {
  // Widened from the const-asserted literal: the table treats every resource
  // the same way, and optional members like quickActions are only visible
  // through the interface.
  const spec: ResourceSpec = ADMIN_RESOURCES[resource]
  const { toast } = useToast()

  const [rows, setRows] = useState<Row[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<Row | null>(null)
  const [confirming, setConfirming] = useState<Row | null>(null)
  const [busy, setBusy] = useState(false)

  // Guards against an out-of-order response overwriting a newer one: typing
  // quickly starts several requests and they do not necessarily return in the
  // order they were sent.
  const requestId = useRef(0)

  const load = useCallback(async () => {
    const id = ++requestId.current
    setLoading(true)
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(PAGE_SIZE),
        search,
        ...(filter ? { filter } : {}),
      })
      const res = await fetch(`/api/admin/resources/${resource}?${params}`)
      if (id !== requestId.current) return
      if (!res.ok) {
        setError(await apiErrorMessage(res, 'Could not load this section'))
        return
      }
      const data = await res.json()
      // Checked again after parsing, not only after the response arrives.
      // Reading the body is itself an await, so a large page that arrives
      // first but parses slowly could still land on top of a newer one that
      // had already been applied.
      if (id !== requestId.current) return
      setRows(data.rows ?? [])
      setTotal(data.total ?? 0)
      setError(null)
    } catch {
      if (id === requestId.current) setError('Could not reach the server')
    } finally {
      if (id === requestId.current) setLoading(false)
    }
  }, [resource, page, search, filter])

  useEffect(() => { load() }, [load])

  // Debounced so each keystroke does not become a query.
  const [searchInput, setSearchInput] = useState('')
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput)
      setPage(1)
    }, SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [searchInput])

  const save = async (id: string, changes: Record<string, unknown>) => {
    setBusy(true)
    try {
      const res = await fetch(`/api/admin/resources/${resource}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...changes }),
      })
      if (!res.ok) {
        toast(await apiErrorMessage(res, 'Could not save'), 'error')
        return false
      }
      toast(`${spec.label} updated`, 'success')
      setEditing(null)
      await load()
      return true
    } catch {
      toast('Could not reach the server', 'error')
      return false
    } finally {
      setBusy(false)
    }
  }

  const remove = async (row: Row) => {
    setBusy(true)
    try {
      const res = await fetch(`/api/admin/resources/${resource}?id=${encodeURIComponent(String(row.id))}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        toast(await apiErrorMessage(res, 'Could not delete'), 'error')
        return
      }
      toast(`${spec.label} deleted`, 'success')
      setConfirming(null)
      await load()
    } catch {
      toast('Could not reach the server', 'error')
    } finally {
      setBusy(false)
    }
  }

  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div>
      <header className="mb-5">
        <h1 className="text-2xl font-black text-white tracking-tight">{spec.plural}</h1>
        <p className="text-neutral-500 text-sm mt-1">{spec.description}</p>
      </header>

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <input
          type="search"
          value={searchInput}
          onChange={e => setSearchInput(e.target.value)}
          placeholder={`Search ${spec.plural.toLowerCase()}…`}
          aria-label={`Search ${spec.plural}`}
          className="flex-1 min-w-[200px] bg-neutral-900 border border-neutral-800 px-3 py-2 text-sm text-white
                     placeholder:text-neutral-600 focus:outline-none focus:border-neutral-600"
        />
        <span className="text-xs text-neutral-500 tabular-nums">
          {loading ? 'Loading…' : `${total.toLocaleString()} ${total === 1 ? spec.label.toLowerCase() : spec.plural.toLowerCase()}`}
        </span>
      </div>

      {filters && (
        <div className="flex gap-1 mb-4">
          {[{ value: '', label: 'All' }, ...filters].map(f => (
            <button
              key={f.value}
              onClick={() => { setFilter(f.value); setPage(1) }}
              className={`px-3 py-1.5 text-xs uppercase tracking-wide font-medium transition-colors ${
                filter === f.value
                  ? 'bg-neutral-800 text-white'
                  : 'text-neutral-500 hover:text-white'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      )}

      {error && (
        <div className="border border-[#D32F2F]/40 bg-[#D32F2F]/10 text-[#ff8a80] text-sm px-4 py-3 mb-4">
          {error}
        </div>
      )}

      <div className="border border-neutral-800 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-neutral-900 text-left">
              {spec.columns.map(col => (
                <th key={col} className="px-3 py-2 font-medium text-neutral-400 text-xs uppercase tracking-wide whitespace-nowrap">
                  {humanise(col)}
                </th>
              ))}
              <th className="px-3 py-2 w-px" />
            </tr>
          </thead>
          <tbody>
            {loading && rows.length === 0 && (
              <tr><td colSpan={spec.columns.length + 1} className="px-3 py-10 text-center text-neutral-600">Loading…</td></tr>
            )}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={spec.columns.length + 1} className="px-3 py-10 text-center text-neutral-600">
                  {search ? `No ${spec.plural.toLowerCase()} match “${search}”` : `No ${spec.plural.toLowerCase()} yet`}
                </td>
              </tr>
            )}
            {rows.map(row => (
              <tr key={String(row.id)} className="border-t border-neutral-900 hover:bg-neutral-900/50">
                {spec.columns.map(col => (
                  <td key={col} className="px-3 py-2 align-middle text-neutral-300 max-w-[22rem]">
                    <Cell column={col} row={row} />
                  </td>
                ))}
                <td className="px-3 py-2 whitespace-nowrap text-right">
                  {/* Navigations, before the field-changing actions. */}
                  {spec.rowLinks?.map(link => (
                    <Link
                      key={link.label}
                      href={link.href(row)}
                      title={link.title}
                      aria-label={link.title}
                      className="px-2 py-1 text-xs uppercase tracking-wide text-neutral-400 hover:text-white"
                    >
                      {link.label}
                    </Link>
                  ))}
                  {spec.quickActions
                    ?.filter(a => !a.when || a.when(row))
                    .map(a => (
                      <button
                        key={a.label}
                        onClick={() => save(String(row.id), a.patch)}
                        disabled={busy}
                        className={`text-xs uppercase tracking-wide px-2 py-1 disabled:opacity-40 ${
                          a.tone === 'primary'
                            ? 'text-green-400 hover:text-green-300'
                            : 'text-neutral-500 hover:text-white'
                        }`}
                      >
                        {a.label}
                      </button>
                    ))}
                  <button
                    onClick={() => setEditing(row)}
                    className="text-xs uppercase tracking-wide text-neutral-400 hover:text-white px-2 py-1"
                  >
                    Edit
                  </button>
                  {spec.deletable && (
                    <button
                      onClick={() => setConfirming(row)}
                      className="text-xs uppercase tracking-wide text-neutral-500 hover:text-[#D32F2F] px-2 py-1"
                    >
                      Delete
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between mt-4">
        <p className="text-xs text-neutral-600 tabular-nums">
          Page {page} of {lastPage}
        </p>
        <div className="flex gap-2">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page <= 1 || loading}
            className="px-3 py-1.5 text-xs uppercase tracking-wide border border-neutral-800 text-neutral-400
                       hover:text-white hover:border-neutral-600 disabled:opacity-30 disabled:hover:text-neutral-400
                       disabled:hover:border-neutral-800 transition-colors"
          >
            Previous
          </button>
          <button
            onClick={() => setPage(p => Math.min(lastPage, p + 1))}
            disabled={page >= lastPage || loading}
            className="px-3 py-1.5 text-xs uppercase tracking-wide border border-neutral-800 text-neutral-400
                       hover:text-white hover:border-neutral-600 disabled:opacity-30 disabled:hover:text-neutral-400
                       disabled:hover:border-neutral-800 transition-colors"
          >
            Next
          </button>
        </div>
      </div>

      {editing && (
        <EditRecordModal
          resource={resource}
          row={editing}
          busy={busy}
          onClose={() => setEditing(null)}
          onSave={changes => save(String(editing.id), changes)}
        />
      )}

      {confirming && (
        <ConfirmDelete
          resource={resource}
          row={confirming}
          busy={busy}
          onCancel={() => setConfirming(null)}
          onConfirm={() => remove(confirming)}
        />
      )}
    </div>
  )
}

/** Compact age, falling back to a date once "days ago" stops being useful. */
function relativeDate(date: Date): string {
  const seconds = Math.round((Date.now() - date.getTime()) / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  if (days < 30) return `${days}d ago`
  return formatDate(date)
}

function humanise(column: string): string {
  return column
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, c => c.toUpperCase())
    .trim()
}

/** Renders one cell, with the few columns that need more than text. */
function Cell({ column, row }: { column: string; row: Row }) {
  const value = row[column]

  // A comment's photo, as a thumbnail linking to it.
  if (column === 'photoThumb' && typeof value === 'string') {
    return (
      <Link href={`/photos/${row.photoId}`} target="_blank" className="block w-10 h-10 relative bg-neutral-900">
        <Image src={value} alt="" fill sizes="40px" className="object-cover" />
      </Link>
    )
  }

  // What a comment or note is about, named rather than identified.
  if ((column === 'photo' || column === 'about') && typeof value === 'string') {
    const href = column === 'photo' ? `/photos/${row.photoId}` : row.aboutHref
    return typeof href === 'string'
      ? <Link href={href} target="_blank" className="block truncate hover:text-white" title={value}>{value}</Link>
      : <span className="text-neutral-600 italic">{value}</span>
  }

  if (column === 'thumbnail' && typeof value === 'string') {
    return (
      <Link href={`/photos/${row.id}`} target="_blank" className="block w-12 h-12 relative bg-neutral-900">
        <Image src={value} alt="" fill sizes="48px" className="object-cover" />
      </Link>
    )
  }

  if (column === 'username' && typeof value === 'string') {
    return <Link href={`/${value}`} target="_blank" className={textLinkClass}>@{value}</Link>
  }

  if (column === 'owner' && typeof value === 'string') {
    return <Link href={`/${value}`} target="_blank" className="hover:text-white">@{value}</Link>
  }

  // A report's summary is the fastest way in: click it and you are looking at
  // what was reported.
  if (column === 'summary' && typeof value === 'string') {
    const href = row.targetHref
    return typeof href === 'string'
      ? <Link href={href} target="_blank" className="block truncate hover:text-white" title={value}>{value}</Link>
      : <span className="text-neutral-600 italic">{value}</span>
  }

  if (column === 'status' && typeof value === 'string') {
    const tone = value === 'OPEN' ? 'text-[#ff8a80]' : value === 'RESOLVED' ? 'text-green-400' : 'text-neutral-500'
    return <span className={`text-xs uppercase tracking-wide ${tone}`}>{displayValue(column, value)}</span>
  }

  // Any other column with a known vocabulary reads as words, not codes.
  if (typeof value === 'string' && VALUE_LABELS[column]) {
    return <span>{displayValue(column, value)}</span>
  }

  if (typeof value === 'boolean') {
    return (
      <span className={value ? 'text-green-400' : 'text-neutral-600'}>
        {value ? 'Yes' : 'No'}
      </span>
    )
  }

  if (value === null || value === undefined || value === '') {
    return <span className="text-neutral-700">—</span>
  }

  if (column.endsWith('At') && typeof value === 'string') {
    const date = new Date(value)
    // "3 days ago" is what you actually want to know when triaging a queue;
    // the exact timestamp stays available on hover for when you need it.
    return (
      <span className="text-neutral-500 whitespace-nowrap" title={date.toLocaleString()}>
        {relativeDate(date)}
      </span>
    )
  }

  if (Array.isArray(value)) {
    return <span className="text-neutral-400">{value.join(', ') || '—'}</span>
  }

  const text = String(value)
  return (
    <span className="block truncate" title={text.length > 60 ? text : undefined}>
      {text}
    </span>
  )
}

/**
 * Deletion asks for the record's name to be typed back for the destructive
 * cases. A one-click confirm on a table row is how the wrong row goes.
 */
function ConfirmDelete({
  resource, row, busy, onCancel, onConfirm,
}: {
  resource: ResourceName
  row: Row
  busy: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  // Widened from the const-asserted literal: the table treats every resource
  // the same way, and optional members like quickActions are only visible
  // through the interface.
  const spec: ResourceSpec = ADMIN_RESOURCES[resource]
  const label = String(row.username ?? row.name ?? row.caption ?? row.content ?? row.id ?? '')
  // Removing an account takes its photos, likes and comments with it, and a
  // camera or film stock is referenced by other people's uploads.
  const heavy = resource === 'users'
  const [typed, setTyped] = useState('')
  const expected = String(row.username ?? row.id ?? '')

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={onCancel}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-delete-title"
        className="bg-neutral-900 border border-neutral-800 max-w-md w-full p-6"
        onClick={e => e.stopPropagation()}
      >
        <h2 id="confirm-delete-title" className="text-lg font-bold text-white mb-2">
          Delete this {spec.label.toLowerCase()}?
        </h2>
        <p className="text-neutral-400 text-sm mb-4 break-words">
          <span className="text-neutral-300">{label.slice(0, 140) || '(untitled)'}</span>
        </p>

        {resource === 'users' && (
          <p className="text-[#ff8a80] text-sm mb-4">
            This also removes their photos, albums, comments and likes, and the image files behind them.
            It cannot be undone.
          </p>
        )}
        {(resource === 'cameras' || resource === 'films') && (
          <p className="text-neutral-400 text-sm mb-4">
            Photos referencing this will keep their other details but lose the link.
          </p>
        )}
        {resource === 'photos' && (
          <p className="text-neutral-400 text-sm mb-4">
            The original, medium and thumbnail files are deleted from storage too.
          </p>
        )}

        {heavy && (
          <label className="block mb-4">
            <span className="text-xs uppercase tracking-wide text-neutral-500">
              Type <span className="text-white font-mono">{expected}</span> to confirm
            </span>
            <input
              value={typed}
              onChange={e => setTyped(e.target.value)}
              className="mt-1 w-full bg-neutral-950 border border-neutral-800 px-3 py-2 text-sm text-white
                         focus:outline-none focus:border-neutral-600"
              autoFocus
            />
          </label>
        )}

        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            disabled={busy}
            className="px-4 h-9 text-xs uppercase tracking-wide font-bold bg-neutral-800 text-white hover:bg-neutral-700 disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={busy || (heavy && typed !== expected)}
            className="px-4 h-9 text-xs uppercase tracking-wide font-bold bg-[#D32F2F] text-white hover:bg-[#B71C1C]
                       disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {busy ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  )
}
