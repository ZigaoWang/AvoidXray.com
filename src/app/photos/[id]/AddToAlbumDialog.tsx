'use client'

import { useEffect, useId, useState } from 'react'
import { useRouter } from 'next/navigation'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import FieldLabel from '@/components/ui/FieldLabel'
import { fieldClass } from '@/components/ui/Field'
import VisibilityToggle from '@/components/ui/VisibilityToggle'
import { useToast } from '@/components/ui/Toast'
import { focusRingInset } from '@/components/ui/focus'
import { apiErrorMessage } from '@/lib/apiError'

/**
 * Filing one photograph into an album, from the photograph.
 *
 * The only ways to do this were the upload form — no help at all once a photo
 * is up — and the album's own edit page, which means leaving the photo,
 * finding the album, and picking the frame back out of a grid of everything
 * you have ever uploaded. For one photo you are already looking at, that is
 * the whole job done backwards.
 *
 * The name cap matches what POST /api/albums enforces, so a name too long is
 * caught in the field rather than as an error after the request.
 */

/** The same ceiling the album endpoints apply. */
const ALBUM_NAME_MAX = 120

type MyAlbum = { id: string; name: string; public: boolean; _count?: { photos: number } }

export default function AddToAlbumDialog({
  open,
  onClose,
  photoId,
  /** Albums this photo is already in, which are offered as done rather than hidden. */
  memberAlbumIds,
}: {
  open: boolean
  onClose: () => void
  photoId: string
  memberAlbumIds: string[]
}) {
  const fid = useId()
  const router = useRouter()
  const { toast } = useToast()

  const [albums, setAlbums] = useState<MyAlbum[] | null>(null)
  const [loadFailed, setLoadFailed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [newPublic, setNewPublic] = useState(false)

  // Loaded when the dialog opens rather than with the page: most people
  // looking at a photo never open this, and it is a list that changes.
  useEffect(() => {
    if (!open) return
    let cancelled = false
    setAlbums(null)
    setLoadFailed(false)
    setCreating(false)
    setNewName('')
    setNewPublic(false)

    fetch('/api/albums')
      .then(res => (res.ok ? res.json() : Promise.reject(new Error())))
      .then(data => {
        if (cancelled) return
        setAlbums(Array.isArray(data) ? data : [])
      })
      .catch(() => {
        if (!cancelled) setLoadFailed(true)
      })

    return () => { cancelled = true }
  }, [open])

  async function addTo(album: MyAlbum) {
    if (busy) return
    setBusy(true)
    try {
      const res = await fetch(`/api/albums/${album.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ addPhotoIds: [photoId] }),
      })
      if (!res.ok) {
        toast(await apiErrorMessage(res, `Could not add it to ${album.name}`), 'error')
        return
      }
      toast(`Added to ${album.name}`, 'success')
      router.refresh()
      onClose()
    } catch {
      toast('Could not reach the server', 'error')
    } finally {
      setBusy(false)
    }
  }

  async function createAndAdd() {
    const name = newName.trim()
    if (!name || busy) return
    setBusy(true)
    try {
      // One request: the endpoint takes the photo with the album, so a failure
      // cannot leave an empty album behind the way create-then-add would.
      const res = await fetch('/api/albums', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, public: newPublic, photoIds: [photoId] }),
      })
      if (!res.ok) {
        toast(await apiErrorMessage(res, 'Could not create the album'), 'error')
        return
      }
      toast(`Added to ${name}`, 'success')
      router.refresh()
      onClose()
    } catch {
      toast('Could not reach the server', 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Add to album">
      <div className="max-h-[60vh] overflow-y-auto">
        {loadFailed ? (
          <p className="px-4 py-6 text-sm text-neutral-500">
            Your albums could not be loaded. Close this and try again.
          </p>
        ) : albums === null ? (
          <p className="px-4 py-6 text-sm text-neutral-500" role="status">
            Loading your albums…
          </p>
        ) : albums.length === 0 ? (
          <p className="px-4 py-6 text-sm text-neutral-500">
            You have no albums yet. Name one below and this photo starts it.
          </p>
        ) : (
          <ul>
            {albums.map(album => {
              const alreadyIn = memberAlbumIds.includes(album.id)
              return (
                <li key={album.id}>
                  <button
                    type="button"
                    onClick={() => addTo(album)}
                    // Present but inert, so the album you were looking for is
                    // never simply missing from the list.
                    disabled={alreadyIn || busy}
                    className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors
                                enabled:hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60
                                ${focusRingInset}`}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium text-white">{album.name}</span>
                        {!album.public && <Badge>Private</Badge>}
                      </span>
                      {album._count && (
                        <span className="mt-0.5 block text-xs text-neutral-500">
                          {album._count.photos} {album._count.photos === 1 ? 'photo' : 'photos'}
                        </span>
                      )}
                    </span>
                    {alreadyIn ? (
                      <span className="flex-shrink-0 text-xs text-neutral-500">Added</span>
                    ) : (
                      <svg className="h-4 w-4 flex-shrink-0 text-neutral-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                      </svg>
                    )}
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      <div className="border-t border-neutral-800 p-4">
        {creating ? (
          <div className="space-y-4">
            <div>
              <FieldLabel htmlFor={`${fid}-name`} required>New album</FieldLabel>
              <input
                id={`${fid}-name`}
                type="text"
                autoFocus
                value={newName}
                maxLength={ALBUM_NAME_MAX}
                onChange={event => setNewName(event.target.value)}
                onKeyDown={event => { if (event.key === 'Enter') createAndAdd() }}
                placeholder="Album name…"
                className={fieldClass}
              />
            </div>

            <VisibilityToggle
              value={newPublic ? 'PUBLIC' : 'PRIVATE'}
              onChange={next => setNewPublic(next === 'PUBLIC')}
              label="Who can see this album"
            />

            <div className="flex gap-2">
              <Button onClick={createAndAdd} disabled={busy || !newName.trim()} fullWidth>
                {busy ? 'Creating…' : 'Create and add'}
              </Button>
              <Button variant="secondary" onClick={() => setCreating(false)} disabled={busy}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <Button variant="outline" onClick={() => setCreating(true)} disabled={busy} fullWidth>
            + New album
          </Button>
        )}
      </div>
    </Modal>
  )
}
