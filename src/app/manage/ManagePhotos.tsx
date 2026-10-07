'use client'

import { useEffect, useId, useState } from 'react'
import { focusRing } from '@/components/ui/focus'
import Combobox from '@/components/Combobox'
import Button from '@/components/ui/Button'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import Modal from '@/components/ui/Modal'
import AddToAlbumDialog from '@/components/AddToAlbumDialog'
import { fieldClass } from '@/components/ui/Field'
import FieldLabel from '@/components/ui/FieldLabel'
import { apiErrorMessage } from '@/lib/apiError'
import { useToast } from '@/components/ui/Toast'
import type { FilmStockOption } from '@/lib/filmSearch'
import PhotoBrowser, { type BrowserPhoto } from '@/components/PhotoBrowser'
import ExportButton from '@/components/ExportButton'
import type { ExportPhoto } from '@/components/ExportDialog'
import { MAX_BATCH } from '@/lib/exportBatch'
import { displayName } from '@/lib/seo/alt'

type Camera = { id: string; name: string; brand: string | null }

/**
 * How many photos one bulk request may carry.
 *
 * The endpoint bounds itself at two hundred, which is right — one request
 * should not ask for unbounded work. Selecting a whole library and applying a
 * film stock to it is a reasonable thing to want, though, so the work is split
 * here rather than the bound raised there.
 */
const BULK_CHUNK = 200

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
export default function ManagePhotos() {
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

  /**
   * One request per two hundred photographs.
   *
   * The endpoint bounds a single call at that, so a selection larger than it
   * used to be silently truncated: the panel said "Apply to 800", the server
   * updated the first two hundred and reported it, and the toast agreed with
   * the server while the person read it as the number they had asked for.
   */
  const inChunks = async <T,>(
    ids: string[],
    run: (batch: string[]) => Promise<T>,
    tally: (result: T) => number,
  ) => {
    let done = 0
    for (let at = 0; at < ids.length; at += BULK_CHUNK) {
      const result = await run(ids.slice(at, at + BULK_CHUNK))
      done += tally(result)
      setProgress(Math.min(ids.length, at + BULK_CHUNK))
    }
    return done
  }

  const apply = async () => {
    const changes = pendingChanges()
    const ids = [...selected]
    if (ids.length === 0 || Object.keys(changes).length === 0) return
    setBusy(true)
    setProgress(0)
    try {
      const updated = await inChunks(
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
      )
      toast(`Updated ${updated} photo${updated === 1 ? '' : 's'}`, 'success')
      setNewCamera(''); setNewFilm(''); setNewDate(''); setNewVisibility('')
      setDialog(null)
      setRevision(r => r + 1)
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Could not reach the server', 'error')
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
      const deleted = await inChunks(
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
      )
      toast(`Deleted ${deleted} photo${deleted === 1 ? '' : 's'}`, 'success')
      setSelected(new Set())
      setConfirmingDelete(false)
      setRevision(r => r + 1)
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Could not reach the server', 'error')
    }
  }

  const n = selected.size
  const photosWord = n === 1 ? 'photo' : 'photos'

  return (
    <div className="pb-24">
      <PhotoBrowser
        refreshToken={revision}
        selected={selected}
        onSelectedChange={setSelected}
        emptyHint="You have not uploaded any photos yet."
        footer={({ photoOf }) => n > 0 && (
          /* One line of actions on whatever is selected.
             This bar used to carry the four editing fields themselves, which
             made it the busiest thing on the page, taller than the screen on a
             phone, and the only place the selection could be acted on. The
             fields now open in a dialog, so the bar names the selection and
             offers what can be done with it, and filing photos into an album,
             which this page had no way to do, sits beside the rest. */
          <div className="fixed inset-x-0 bottom-0 z-30 border-t border-neutral-800 bg-[#0a0a0a]/95 backdrop-blur
                          pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">
            <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-3 gap-y-2 px-6">
              <p className="flex items-center gap-2 text-sm" role="status" aria-live="polite">
                <span className="font-bold tabular-nums text-white">{n.toLocaleString()}</span>
                <span className="text-neutral-400">selected</span>
                <button
                  type="button"
                  onClick={() => setSelected(new Set())}
                  className={`-my-2 px-2 py-2 text-xs text-neutral-400 underline underline-offset-4 hover:text-white ${focusRing}`}
                >
                  Clear
                </button>
              </p>

              {/* Two by two on a phone, so four actions are four equal
                  targets instead of a ragged wrap; one row from sm. */}
              <div className="grid w-full grid-cols-2 gap-2 sm:ml-auto sm:flex sm:w-auto sm:items-center">
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
                        body: `${n} photographs are selected, and one export takes ${MAX_BATCH} at a time. The other ${short} stay selected, so pressing Export again takes the next ${Math.min(MAX_BATCH, short)}.`,
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
              </div>
            </div>
          </div>
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
        <div className="flex justify-end gap-2 border-t border-neutral-800 p-4">
          <Button variant="secondary" onClick={closeEdit} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={apply} disabled={busy || changeCount === 0}>
            {busy
              ? progress && n > BULK_CHUNK
                ? `Applying ${progress} of ${n}…`
                : 'Applying…'
              : `Apply to ${n.toLocaleString()}`}
          </Button>
        </div>
      </Modal>

      <AddToAlbumDialog
        open={dialog === 'album'}
        onClose={() => setDialog(null)}
        photoIds={[...selected]}
      />

      <ConfirmDialog
        open={confirmingDelete}
        title={`Delete ${n.toLocaleString()} ${photosWord}?`}
        confirmLabel={`Delete ${n.toLocaleString()}`}
        busyLabel="Deleting…"
        onConfirm={removeSelected}
        onClose={() => setConfirmingDelete(false)}
      >
        The image files are removed from storage as well, along with their likes and comments.
        This cannot be undone.
      </ConfirmDialog>
    </div>
  )
}
