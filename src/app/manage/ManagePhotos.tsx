'use client'

import { useEffect, useId, useState } from 'react'
import Combobox from '@/components/Combobox'
import Button from '@/components/ui/Button'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import Modal, { ModalFooter } from '@/components/ui/Modal'
import AddToAlbumDialog from '@/components/AddToAlbumDialog'
import { fieldClass } from '@/components/ui/Field'
import FieldLabel from '@/components/ui/FieldLabel'
import { apiErrorMessage } from '@/lib/apiError'
import { useToast } from '@/components/ui/Toast'
import type { FilmStockOption } from '@/lib/filmSearch'
import PhotoBrowser, { type BrowserPhoto } from '@/components/PhotoBrowser'
import ExportButton from '@/components/ExportButton'
import SelectionBar, { SELECTION_BAR_ROOM } from '@/components/SelectionBar'
import type { ExportPhoto } from '@/components/ExportDialog'
import { MAX_BATCH } from '@/lib/exportBatch'
import { BULK_BATCH, BatchFailure, inBatches } from '@/lib/batches'
import { displayName } from '@/lib/seo/alt'

type Camera = { id: string; name: string; brand: string | null }

/**
 * The row that puts a field back to changing nothing.
 *
 * Combobox has no empty state of its own: once a camera was chosen there was no
 * way to unchoose it, so picking one by mistake meant closing the bar, clearing
 * the selection and starting again — or applying a change you had decided
 * against. An explicit row is better than a second control to clear it, because
 * "leave unchanged" is a real answer here rather than the absence of one.
 */
const UNCHANGED = { id: '', name: 'Leave unchanged' }

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
  const fid = useId()

  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState(0)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  /** Which of the selection's dialogs is open, if any. */
  const [dialog, setDialog] = useState<'edit' | 'album' | null>(null)
  /** Bumped to make the browser re-read the list after a change lands. */
  const [revision, setRevision] = useState(0)

  const [cameras, setCameras] = useState<Camera[]>([])
  const [films, setFilms] = useState<FilmStockOption[]>([])

  // Pending bulk values. Empty means "leave this field alone".
  const [newCamera, setNewCamera] = useState('')
  const [newFilm, setNewFilm] = useState('')
  const [newDate, setNewDate] = useState('')
  const [newVisibility, setNewVisibility] = useState('')

  useEffect(() => {
    fetch('/api/cameras').then(r => r.json()).then(d => setCameras(Array.isArray(d) ? d : [])).catch(() => {})
    fetch('/api/filmstocks').then(r => r.json()).then(d => setFilms(Array.isArray(d) ? d : [])).catch(() => {})
  }, [])

  const pendingChanges = () => {
    const changes: Record<string, unknown> = {}
    if (newCamera) changes.cameraId = newCamera
    if (newFilm) changes.filmStockId = newFilm
    if (newDate) changes.takenDate = newDate
    if (newVisibility) changes.visibility = newVisibility
    return changes
  }

  const changeCount = Object.keys(pendingChanges()).length

  const apply = async () => {
    const changes = pendingChanges()
    const ids = [...selected]
    if (ids.length === 0 || Object.keys(changes).length === 0) return
    setBusy(true)
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
      setNewCamera(''); setNewFilm(''); setNewDate(''); setNewVisibility('')
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
      setBusy(false)
      setProgress(0)
    }
  }

  // No busy flag of its own: the dialog owns that while onConfirm is in flight,
  // and the editing bar behind it cannot be reached anyway.
  const closeEdit = () => {
    setDialog(null)
    setNewCamera(''); setNewFilm(''); setNewDate(''); setNewVisibility('')
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
            {/* Asked rather than announced, when a selection is larger
                than one export will take. One press exports sixty and
                Select all reaches six hundred here, and an export cannot
                include a photograph it cannot describe, because the
                proportions and the gear come from the pages the browser
                has fetched. Either way the difference is worth a yes or no
                before the panel opens. Finding out from the zip is the bad
                outcome. */}
            {(() => {
              const describable = [...selected]
                .map(photoOf)
                .filter((p): p is BrowserPhoto => Boolean(p))
              const exporting = describable.slice(0, MAX_BATCH).map(forExport)
              const short = n - exporting.length
              return (
                <ExportButton
                  photos={exporting}
                  label="Export"
                  size="sm"
                  fullWidth={false}
                  confirm={short > 0 ? {
                    title: `Export the first ${exporting.length}?`,
                    body: `${n} photos are selected, and one export takes ${MAX_BATCH} at a time. The other ${short} stay selected, so pressing Export again takes the next ${Math.min(MAX_BATCH, short)}.`,
                    label: `Export ${exporting.length}`,
                  } : undefined}
                  /* Taken out of the selection once they are in an archive,
                     so the next press carries on rather than building the
                     same sixty again. Only when there were more selected
                     than one export takes: somebody who exported exactly
                     what they picked may want to file the same set next. */
                  onExported={short > 0 ? ids => {
                    setSelected(was => {
                      const next = new Set(was)
                      for (const id of ids) next.delete(id)
                      return next
                    })
                    toast(`Exported ${ids.length}. ${(n - ids.length).toLocaleString()} still selected.`, 'success')
                  } : undefined}
                />
              )
            })()}
            <Button variant="destructive" size="sm" onClick={() => setConfirmingDelete(true)}>
              Delete
            </Button>
          </SelectionBar>
        )}
      />

      {/* Only the fields filled in are sent, so setting the film on forty
          photos does not also blank their dates. The pickers open a list below
          themselves, which a scrolling dialog would clip. */}
      <Modal
        open={dialog === 'edit'}
        onClose={closeEdit}
        busy={busy}
        size="md"
        scrolls={false}
        title={`Edit ${n.toLocaleString()} ${photosWord}`}
        description="Only what you fill in changes. Everything else stays as it is."
      >
        <div className="space-y-4 p-4">
          <Combobox
            label="Camera"
            options={[UNCHANGED, ...cameras]}
            value={newCamera}
            onChange={setNewCamera}
            placeholder="Leave unchanged"
          />
          <Combobox
            label="Film"
            options={[UNCHANGED, ...films]}
            value={newFilm}
            onChange={setNewFilm}
            placeholder="Leave unchanged"
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <FieldLabel htmlFor={`${fid}-taken-date`}>Date taken</FieldLabel>
              <input
                id={`${fid}-taken-date`}
                type="date"
                value={newDate}
                onChange={e => setNewDate(e.target.value)}
                className={fieldClass}
              />
            </div>
            <div>
              <FieldLabel htmlFor={`${fid}-visibility`}>Visibility</FieldLabel>
              <select
                id={`${fid}-visibility`}
                value={newVisibility}
                onChange={e => setNewVisibility(e.target.value)}
                className={fieldClass}
              >
                <option value="">Leave unchanged</option>
                <option value="PUBLIC">Public</option>
                <option value="PRIVATE">Private</option>
              </select>
            </div>
          </div>
        </div>
        <ModalFooter>
          <Button variant="secondary" onClick={closeEdit} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={apply} disabled={busy || changeCount === 0}>
            {busy
              ? progress && n > BULK_BATCH
                ? `Applying ${progress} of ${n}…`
                : 'Applying…'
              : `Apply to ${n.toLocaleString()}`}
          </Button>
        </ModalFooter>
      </Modal>

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
