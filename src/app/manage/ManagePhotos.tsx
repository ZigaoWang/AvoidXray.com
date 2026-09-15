'use client'

import { useEffect, useId, useState } from 'react'
import { focusRing } from '@/components/ui/focus'
import Combobox from '@/components/Combobox'
import Button from '@/components/ui/Button'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
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
  /** Whether the bulk fields are unfolded. Only consulted below sm. */
  const [editingFields, setEditingFields] = useState(false)
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
      setSelected(new Set())
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

  return (
    <div className="pb-24 sm:pb-32">
      <PhotoBrowser
        refreshToken={revision}
        selected={selected}
        onSelectedChange={setSelected}
        emptyHint="You have not uploaded any photos yet."
        footer={({ photoOf }) => selected.size > 0 && (
          /* Scrolls only where it has to.
             The four fields stack below sm and the bar can outgrow the screen
             there, so it scrolls — but a scrolling box clips anything absolute
             inside it, and the camera and film pickers open a list. From sm the
             row fits on one line and the overflow comes off, so the list is
             free to leave the bar. Below sm the list opens upward into the bar
             itself, which is tall enough to hold it. */
          <div className="fixed inset-x-0 bottom-0 z-30 max-h-[75dvh] overflow-y-auto sm:overflow-visible
                          bg-[#0a0a0a]/95 backdrop-blur border-t border-neutral-800
                          pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">
            <div className="max-w-7xl mx-auto px-6">
              <div className="flex flex-wrap items-end gap-3">
                <div className="flex w-full items-center gap-2 sm:w-auto sm:mr-2">
                  <span className="text-sm text-white font-bold tabular-nums">{selected.size}</span>
                  <span className="text-xs text-neutral-400">selected</span>
                  <button
                    onClick={() => setSelected(new Set())}
                    className={`-my-2 px-2 py-2 text-xs text-neutral-400 hover:text-white underline ${focusRing}`}
                  >
                    clear
                  </button>

                  {/* On a phone the four fields stack, and the bar was 400px
                      tall over a 128px reserve — it covered the photographs it
                      was editing, with no way to scroll past it. They start
                      folded away here and are always open from sm. */}
                  <button
                    type="button"
                    onClick={() => setEditingFields(v => !v)}
                    aria-expanded={editingFields}
                    className={`-my-2 ml-auto px-2 py-2 text-xs uppercase tracking-wide text-neutral-400
                                hover:text-white sm:hidden ${focusRing}`}
                  >
                    {editingFields ? 'Hide fields' : 'Edit fields'}
                  </button>
                </div>

                {/* display:contents from sm, so the fields sit in the outer
                    flex row exactly as they did before; a real box only below
                    sm, where it is the thing being folded. */}
                <div className={`${editingFields ? 'flex' : 'hidden'} w-full flex-wrap items-end gap-3 sm:contents`}>
                  <div className="min-w-[180px]">
                    <Combobox
                      label="Camera"
                      options={[UNCHANGED, ...cameras]}
                      value={newCamera}
                      onChange={setNewCamera}
                      placeholder="Leave unchanged"
                    />
                  </div>

                  <div className="min-w-[180px]">
                    <Combobox
                      label="Film"
                      options={[UNCHANGED, ...films]}
                      value={newFilm}
                      onChange={setNewFilm}
                      placeholder="Leave unchanged"
                    />
                  </div>

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

                <div className="flex w-full items-center justify-end gap-2 sm:w-auto sm:ml-auto">
                  <Button variant="destructive" size="sm" onClick={() => setConfirmingDelete(true)} disabled={busy}>
                    Delete
                  </Button>
                  {/* Asked rather than announced, when a selection is larger
                      than one export will take.

                      Two things can shorten it. One press exports sixty and
                      Select all reaches six hundred here; and an export cannot
                      include a photograph it cannot describe, because the
                      proportions and the gear come from the pages the browser
                      has actually fetched. Either way the difference is worth a
                      yes or no before the panel opens, the same way the delete
                      beside it asks. Finding out from the zip is the bad
                      outcome. */}
                  {(() => {
                    const describable = [...selected]
                      .map(photoOf)
                      .filter((p): p is BrowserPhoto => Boolean(p))
                    const exporting = describable.slice(0, MAX_BATCH).map(forExport)
                    const short = selected.size - exporting.length
                    return (
                      <ExportButton
                        photos={exporting}
                        label="Export"
                        size="sm"
                        fullWidth={false}
                        confirm={short > 0 ? {
                          title: `Export the first ${exporting.length}?`,
                          body: exporting.length >= MAX_BATCH
                            ? `${selected.size} photographs are selected, and one export takes ${MAX_BATCH} at a time. The other ${short} stay selected and are not in this archive.`
                            : `${selected.size} photographs are selected, and ${exporting.length} of them are loaded. The other ${short} are not in this archive.`,
                          label: `Export ${exporting.length}`,
                        } : undefined}
                      />
                    )
                  })()}
                  <Button size="sm" onClick={apply} disabled={busy || changeCount === 0}>
                    {busy
                      ? progress && selected.size > BULK_CHUNK
                        ? `Applying ${progress} of ${selected.size}…`
                        : 'Applying…'
                      : changeCount === 0 ? 'Choose a change' : `Apply to ${selected.size}`}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}
      />

      <ConfirmDialog
        open={confirmingDelete}
        title={`Delete ${selected.size} photo${selected.size === 1 ? '' : 's'}?`}
        confirmLabel={`Delete ${selected.size}`}
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
