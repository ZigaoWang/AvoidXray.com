'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import ClientHeader from '@/components/ClientHeader'
import Footer from '@/components/Footer'
import Button from '@/components/ui/Button'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import { pageTitleClass } from '@/components/ui/PageHeader'
import { useToast } from '@/components/ui/Toast'
import { apiErrorMessage } from '@/lib/apiError'

interface TrashedPhoto { id: string; src: string; caption: string | null; purgeAt: string }

const DAY = 24 * 60 * 60 * 1000

async function loadTrash(): Promise<{ photos: TrashedPhoto[]; more: boolean } | null> {
  const res = await fetch('/api/library/trash').catch(() => null)
  return res?.ok ? res.json() : null
}

/**
 * Photos deleted from the library, restorable for 30 days. Deleting from here,
 * or emptying the Trash, is for good: files included.
 */
export default function TrashClient() {
  const { toast } = useToast()
  const [photos, setPhotos] = useState<TrashedPhoto[] | null>(null)
  const [more, setMore] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [confirm, setConfirm] = useState<'selected' | 'all' | null>(null)
  const [busy, setBusy] = useState(false)

  const apply = useCallback((body: Awaited<ReturnType<typeof loadTrash>>) => {
    setPhotos(body?.photos ?? [])
    setMore(body?.more ?? false)
    setSelected(new Set())
  }, [])
  useEffect(() => { void loadTrash().then(apply) }, [apply])
  const reload = () => loadTrash().then(apply)

  const act = async (url: string, body: unknown, method: string, done: string) => {
    setBusy(true)
    try {
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      if (!res.ok) throw new Error(await apiErrorMessage(res, 'That did not work'))
      toast(done, 'success')
      await reload()
    } catch (error) {
      toast(error instanceof Error ? error.message : 'That did not work', 'error')
    } finally {
      setBusy(false)
    }
  }
  const ids = [...selected]

  return (
    <div className="min-h-dvh bg-[#0a0a0a] flex flex-col">
      <ClientHeader />
      <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6">
        <Link href="/library" className="text-sm text-neutral-400 hover:text-white">← Library</Link>
        <div className="mb-2 mt-2 flex flex-wrap items-end justify-between gap-4">
          <h1 className={pageTitleClass}>Trash</h1>
          {photos && photos.length > 0 && (
            <Button variant="destructive" onClick={() => setConfirm('all')} disabled={busy}>Empty Trash</Button>
          )}
        </div>
        <p className="mb-6 text-sm text-neutral-500">Deleted photos stay here for 30 days, then are deleted for good, originals included.</p>

        {selected.size > 0 && (
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <span className="text-sm text-white">{selected.size} selected</span>
            <Button size="sm" disabled={busy} onClick={() => act('/api/library/photos/restore', { ids }, 'POST', `Restored ${ids.length}`)}>Restore</Button>
            <Button size="sm" variant="destructive" disabled={busy} onClick={() => setConfirm('selected')}>Delete for good</Button>
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Cancel</Button>
          </div>
        )}

        {photos === null && <p className="text-sm text-neutral-500">Loading…</p>}
        {photos?.length === 0 && <p className="py-16 text-center text-neutral-400">The Trash is empty.</p>}
        <ul className="grid grid-cols-3 gap-1.5 sm:grid-cols-6 lg:grid-cols-9">
          {photos?.map(photo => {
            const on = selected.has(photo.id)
            const days = Math.max(0, Math.ceil((new Date(photo.purgeAt).getTime() - Date.now()) / DAY))
            return (
              <li key={photo.id}>
                <button type="button" aria-pressed={on}
                  aria-label={`${photo.caption || 'Photo'}, ${days} days left${on ? ', selected' : ''}`}
                  onClick={() => setSelected(prev => { const next = new Set(prev); if (on) next.delete(photo.id); else next.add(photo.id); return next })}
                  className={`relative block aspect-square w-full overflow-hidden bg-neutral-900 outline-none focus-visible:ring-2 focus-visible:ring-brand ${on ? 'ring-2 ring-white' : ''}`}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- the owner's own thumbnail, signed */}
                  <img src={photo.src} alt="" loading="lazy" className="h-full w-full object-cover opacity-80" />
                </button>
                <p className="mt-1 text-[11px] text-neutral-500">{days === 1 ? '1 day left' : `${days} days left`}</p>
              </li>
            )
          })}
        </ul>
        {more && <p className="mt-4 text-sm text-neutral-500">Showing the most recent. Restore or delete some to see the rest.</p>}
      </main>
      <Footer />

      <ConfirmDialog open={confirm !== null} title={confirm === 'all' ? 'Empty the Trash?' : `Delete ${ids.length} for good?`}
        confirmLabel="Delete for good" onClose={() => setConfirm(null)}
        onConfirm={async () => {
          const which = confirm
          setConfirm(null)
          if (which === 'all') await act('/api/library/trash', {}, 'DELETE', 'Trash emptied')
          else await act('/api/library/trash', { ids }, 'DELETE', `Deleted ${ids.length} for good`)
        }}>
        This cannot be undone. The photos and their original files are deleted.
      </ConfirmDialog>
    </div>
  )
}
