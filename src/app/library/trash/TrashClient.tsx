'use client'

import { useCallback, useEffect, useState } from 'react'
import Image from 'next/image'
import ClientHeader from '@/components/ClientHeader'
import PageShell from '@/components/PageShell'
import SelectableTile, { TILE_GRID } from '@/components/SelectableTile'
import SelectionBar, { SELECTION_BAR_ROOM } from '@/components/SelectionBar'
import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import EmptyState from '@/components/ui/EmptyState'
import PageHeader from '@/components/ui/PageHeader'
import SectionError from '@/components/ui/SectionError'
import { ThumbGridSkeleton } from '@/components/ui/Skeleton'
import { useToast } from '@/components/ui/Toast'
import { blurPlaceholder } from '@/lib/blurhash'
import { fetchJson } from '@/lib/fetchJson'
import LibraryTabs from '../LibraryTabs'

interface TrashedPhoto { id: string; src: string; width: number; height: number; caption: string | null; blurHash: string | null; purgeAt: string }

const DAY = 24 * 60 * 60 * 1000
async function fetchTrash(): Promise<{ photos: TrashedPhoto[]; more: boolean } | { error: string }> {
  try {
    return await fetchJson('/api/library/trash', { fallback: 'Could not load the Trash' })
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Could not load the Trash' }
  }
}

const plural = (n: number) => `${n.toLocaleString()} ${n === 1 ? 'photo' : 'photos'}`

/**
 * Photos deleted from the library, restorable for 30 days. Deleting from here,
 * or emptying the Trash, is for good: files included.
 */
export default function TrashClient() {
  const { toast } = useToast()
  const [photos, setPhotos] = useState<TrashedPhoto[] | null>(null)
  const [more, setMore] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [confirm, setConfirm] = useState<'selected' | 'all' | null>(null)
  /** When the list was loaded: what the days left count from. */
  const [loadedAt, setLoadedAt] = useState(0)

  const apply = useCallback((result: Awaited<ReturnType<typeof fetchTrash>>) => {
    if ('error' in result) { setLoadError(result.error); return }
    setLoadError(null)
    setPhotos(result.photos)
    setMore(result.more)
    setLoadedAt(Date.now())
    // What is no longer in the Trash leaves the selection.
    setSelected(prev => new Set([...prev].filter(id => result.photos.some(p => p.id === id))))
  }, [])
  const load = useCallback(() => fetchTrash().then(apply), [apply])
  useEffect(() => { void fetchTrash().then(apply) }, [apply])

  const act = async (url: string, body: unknown, method: string, done: string) => {
    try {
      await fetchJson(url, { method, body })
      toast(done, 'success')
    } catch (error) {
      toast(error instanceof Error ? error.message : 'That did not work', 'error')
    }
    await load()
  }
  const ids = [...selected]
  const n = ids.length
  const toggle = (id: string) => setSelected(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next })

  return (
    <PageShell header={<ClientHeader />}>
      <main id="main-content" tabIndex={-1} className={`mx-auto w-full max-w-7xl flex-1 px-6 py-10 md:py-16 ${n > 0 ? SELECTION_BAR_ROOM : ''}`}>
        <PageHeader
          title="Trash"
          description="Deleted photos stay here for 30 days, then are deleted for good, originals included."
          action={photos && photos.length > 0 && <Button variant="destructive" onClick={() => setConfirm('all')}>Empty Trash</Button>}
        />
        <LibraryTabs current="trash" />

        {photos === null && !loadError && <ThumbGridSkeleton />}
        {loadError && <SectionError className="py-6" message={loadError} onRetry={() => void load()} />}
        {photos?.length === 0 && (
          <EmptyState message="The Trash is empty" hint="Photos you delete from your library wait here for 30 days." action={{ href: '/library', label: 'Back to your library' }} />
        )}
        {photos && photos.length > 0 && (
          <ul className={TILE_GRID}>
            {photos.map((photo, i) => {
              const days = Math.max(0, Math.ceil((new Date(photo.purgeAt).getTime() - loadedAt) / DAY))
              const left = days === 1 ? '1 day left' : `${days} days left`
              return (
                <li key={photo.id}>
                  <SelectableTile
                    selected={selected.has(photo.id)}
                    onSelect={() => toggle(photo.id)}
                    label={`Select ${photo.caption?.trim() || `photo ${i + 1}`}. ${left}.`}
                    image={<Image unoptimized fill src={photo.src} alt="" className="object-contain"
                      sizes="(max-width: 640px) 33vw, (max-width: 768px) 25vw, 17vw" {...blurPlaceholder(photo.blurHash, i, Number.POSITIVE_INFINITY)} />}
                    badges={<Badge tone={days <= 3 ? 'warningSolid' : 'neutral'}>{left}</Badge>}
                  />
                </li>
              )
            })}
          </ul>
        )}
        {more && <p className="mt-4 text-sm text-neutral-500">Showing the most recent. Restore or delete some to see the rest.</p>}
      </main>

      <SelectionBar count={n} onClear={() => setSelected(new Set())}>
        <Button variant="outline" size="sm" onClick={() => void act('/api/library/photos/restore', { ids }, 'POST', `Restored ${plural(n)}`)}>Restore {n.toLocaleString()}</Button>
        <Button variant="destructive" size="sm" onClick={() => setConfirm('selected')}>Delete {n.toLocaleString()} for good</Button>
      </SelectionBar>

      <ConfirmDialog open={confirm !== null} title={confirm === 'all' ? 'Empty the Trash?' : `Delete ${plural(n)} for good?`}
        confirmLabel="Delete for good" onClose={() => setConfirm(null)}
        onConfirm={async () => {
          const which = confirm
          setConfirm(null)
          if (which === 'all') await act('/api/library/trash', {}, 'DELETE', 'Trash emptied')
          else await act('/api/library/trash', { ids }, 'DELETE', `Deleted ${plural(n)} for good`)
        }}>
        This cannot be undone. The photos and their original files are deleted.
      </ConfirmDialog>
    </PageShell>
  )
}
