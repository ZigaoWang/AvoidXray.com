'use client'

import { useState } from 'react'
import Button from '@/components/ui/Button'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import AddToAlbumDialog from '@/components/AddToAlbumDialog'
import { apiErrorMessage } from '@/lib/apiError'
import { useToast } from '@/components/ui/Toast'
import PhotoBrowser, { type BrowserPhoto } from '@/components/PhotoBrowser'
import EditDetailsDialog from '@/components/EditDetailsDialog'
import ExportSelectionButton from '@/components/ExportSelectionButton'
import SelectionBar, { SELECTION_BAR_ROOM } from '@/components/SelectionBar'
import type { ExportPhoto } from '@/components/ExportDialog'
import { BULK_BATCH, BatchFailure, inBatches } from '@/lib/batches'
import { displayName } from '@/lib/seo/alt'

/**
 * A selected photograph as the export dialog wants it.
 *
 * The catalog rows arrive as objects and the dialog wants the line a person
 * would read, which is what displayName builds — the same "Kodak Gold 200" the
 * photo page hands it, rather than a bare "Gold 200" that would then be what
 * the exported file is named.
 */
function forExport(photo: BrowserPhoto): ExportPhoto {
  return {
    id: photo.id,
    width: photo.width ?? 0,
    height: photo.height ?? 0,
    camera: displayName(photo.camera),
    filmStock: displayName(photo.filmStock),
    takenDate: photo.takenDate ?? null,
    caption: photo.caption,
    thumbnailPath: photo.thumbnailPath,
  }
}

/**
 * Bulk editing for your own photos.
 *
 * A roll is thirty-six frames sharing a camera, a film stock and a date. Fixing
 * one wrong choice meant opening each photo's edit page in turn, so the work
 * scaled with the mistake. Everything here operates on a selection, and only
 * the fields you actually fill in are sent — so setting the film on forty
 * photos does not also blank their captions.
 *
 * The browsing, the filters and the selection are PhotoBrowser's, which the
 * album picker uses too. What is left here is the one thing this screen does
 * that the picker does not: change the photographs.
 */
/** `usesTrash`: this account deletes into the library's Trash rather than outright. */
export default function ManagePhotos({ usesTrash }: { usesTrash: boolean }) {
  const { toast } = useToast()

  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [progress, setProgress] = useState(0)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  /** Which of the selection's dialogs is open, if any. */
  const [dialog, setDialog] = useState<'edit' | 'album' | null>(null)
  /** Bumped to make the browser re-read the list after a change lands. */
  const [revision, setRevision] = useState(0)

  const apply = async (changes: Record<string, string | null>) => {
    const ids = [...selected]
    if (ids.length === 0 || Object.keys(changes).length === 0) return
    setProgress(0)
    try {
      const updated = await inBatches(
        ids,
        async batch => {
          const res = await fetch('/api/photos/bulk', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ids: batch, changes }),
          })
          if (!res.ok) throw new Error(await apiErrorMessage(res, 'Could not apply the changes'))
          return res.json()
        },
        data => data.updated ?? 0,
        { onProgress: setProgress },
      )
      toast(`Updated ${updated} photo${updated === 1 ? '' : 's'}`, 'success')
      setDialog(null)
      setRevision(r => r + 1)
    } catch (error) {
      const failure = error as BatchFailure
      if (failure.done > 0) {
        toast(`Updated ${failure.done} of ${ids.length} photos. The rest were not changed: ${failure.message}`, 'error')
        setRevision(r => r + 1)
      } else {
        toast(failure.message, 'error')
      }
    } finally {
      setProgress(0)
    }
  }


  const removeSelected = async () => {
    const ids = [...selected]
    try {
      const deleted = await inBatches(
        ids,
        async batch => {
          const res = await fetch('/api/photos/bulk', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ids: batch }),
          })
          if (!res.ok) throw new Error(await apiErrorMessage(res, 'Could not delete'))
          return res.json()
        },
        data => data.deleted ?? 0,
        { onProgress: setProgress },
      )
      toast(usesTrash ? `Moved ${deleted} to the Trash` : `Deleted ${deleted} photo${deleted === 1 ? '' : 's'}`, 'success')
      setSelected(new Set())
      setConfirmingDelete(false)
      setRevision(r => r + 1)
    } catch (error) {
      const failure = error as BatchFailure
      // The batches before the failure are gone. Left selected and on screen,
      // they read as still there, and the message said nothing had happened.
      if (failure.done > 0) {
        toast(`Deleted ${failure.done} of ${ids.length} photos. The rest could not be deleted: ${failure.message}`, 'error')
        setSelected(current => {
          const next = new Set(current)
          for (const id of failure.processed) next.delete(id)
          return next
        })
        setRevision(r => r + 1)
      } else {
        toast(failure.message, 'error')
      }
    }
  }

  const n = selected.size
  const photosWord = n === 1 ? 'photo' : 'photos'

  return (
    <div className={SELECTION_BAR_ROOM}>
      <PhotoBrowser
        refreshToken={revision}
        selected={selected}
        onSelectedChange={setSelected}
        emptyHint="You have not uploaded any photos yet."
        footer={({ photoOf }) => (
          <SelectionBar count={n} onClear={() => setSelected(new Set())}>
            <Button variant="outline" size="sm" onClick={() => setDialog('album')}>
              Add to album
            </Button>
            <Button variant="outline" size="sm" onClick={() => setDialog('edit')}>
              Edit details
            </Button>
            <ExportSelectionButton
              photos={[...selected].map(photoOf).filter((p): p is BrowserPhoto => Boolean(p)).map(forExport)}
              selectedCount={n}
              onExportedBatch={ids => setSelected(was => {
                const next = new Set(was)
                for (const id of ids) next.delete(id)
                return next
              })}
            />
            <Button variant="destructive" size="sm" onClick={() => setConfirmingDelete(true)}>
              Delete
            </Button>
          </SelectionBar>
        )}
      />

      <EditDetailsDialog
        open={dialog === 'edit'}
        count={n}
        fields={['camera', 'film', 'date', 'visibility']}
        allowAdd={false}
        progress={progress && n > BULK_BATCH ? `Applying ${progress} of ${n}…` : undefined}
        onApply={apply}
        onClose={() => setDialog(null)}
      />

      <AddToAlbumDialog
        open={dialog === 'album'}
        onClose={() => setDialog(null)}
        photoIds={[...selected]}
      />

      <ConfirmDialog
        open={confirmingDelete}
        title={usesTrash ? `Move ${n.toLocaleString()} ${photosWord} to the Trash?` : `Delete ${n.toLocaleString()} ${photosWord}?`}
        confirmLabel={usesTrash ? 'Move to Trash' : `Delete ${n.toLocaleString()}`}
        busyLabel={usesTrash ? 'Moving…' : 'Deleting…'}
        onConfirm={removeSelected}
        onClose={() => setConfirmingDelete(false)}
      >
        {usesTrash
          ? 'They disappear from your profile, albums and explore at once. Restore them from the Trash in your library within 30 days; after that they are deleted for good.'
          : 'The image files are removed from storage as well, along with their likes and comments. This cannot be undone.'}
      </ConfirmDialog>
    </div>
  )
}
