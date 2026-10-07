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
import { MAX_ALBUM_PHOTO_IDS } from '@/lib/albumLimits'

/**
 * Filing photographs into an album, from wherever they are being looked at.
 *
 * The only ways to do this were the upload form, no help at all once a photo
 * is up, and the album's own edit page, which means leaving the photo,
 * finding the album, and picking the frame back out of a grid of everything
 * you have ever uploaded. For one photo you are already looking at, that is
 * the whole job done backwards.
 *
 * Takes a list so the same dialog serves a single photo page and a selection
 * of a whole roll on /manage, which had no way to file anything at all.
 *
 * The name cap matches what POST /api/albums enforces, so a name too long is
 * caught in the field rather than as an error after the request.
 */

/** The same ceiling the album endpoints apply. */
const ALBUM_NAME_MAX = 120

/**
 * How many ids one album request may carry, which is what the endpoints cap
 * at. A larger selection goes in several requests rather than being cut short.
 */
const ALBUM_CHUNK = MAX_ALBUM_PHOTO_IDS

type MyAlbum = { id: string; name: string; public: boolean; _count?: { photos: number } }

export default function AddToAlbumDialog({
  open,
  onClose,
  photoIds,
  /** Albums these photos are already in, offered as done rather than hidden. */
  memberAlbumIds = [],
  onAdded,
}: {
  open: boolean
  onClose: () => void
  photoIds: string[]
  memberAlbumIds?: string[]
  /** Called once the photos are in, with the album's name. */
  onAdded?: (albumName: string) => void
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

  const them = photoIds.length === 1 ? 'the photo' : `${photoIds.length.toLocaleString()} photos`

  // Loaded when the dialog opens rather than with the page: most people
  // looking at a photo never open this, and it is a list that changes.
  useEffect(() => {
    if (!open) return
    let canceled = false
    setAlbums(null)
    setLoadFailed(false)
    setCreating(false)
    setNewName('')
    setNewPublic(false)

    fetch('/api/albums')
      .then(res => (res.ok ? res.json() : Promise.reject(new Error())))
      .then(data => {
        if (canceled) return
        setAlbums(Array.isArray(data) ? data : [])
      })
      .catch(() => {
        if (!canceled) setLoadFailed(true)
      })

    return () => { canceled = true }
  }, [open])

  async function addTo(album: MyAlbum) {
    if (busy) return
    setBusy(true)
    try {
      for (let at = 0; at < photoIds.length; at += ALBUM_CHUNK) {
        const res = await fetch(`/api/albums/${album.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ addPhotoIds: photoIds.slice(at, at + ALBUM_CHUNK) }),
        })
        if (!res.ok) {
          toast(await apiErrorMessage(res, `Could not add ${them} to ${album.name}`), 'error')
          return
        }
      }
      toast(`Added ${them} to ${album.name}`, 'success')
      onAdded?.(album.name)
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
      // The album is created with its first batch, so a failure cannot leave
      // an empty album behind the way create-then-add would. Anything past one
      // request's worth follows into the album just made.
      const res = await fetch('/api/albums', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, public: newPublic, photoIds: photoIds.slice(0, ALBUM_CHUNK) }),
      })
      if (!res.ok) {
        toast(await apiErrorMessage(res, 'Could not create the album'), 'error')
        return
      }
      const album = await res.json()
      for (let at = ALBUM_CHUNK; at < photoIds.length; at += ALBUM_CHUNK) {
        const more = await fetch(`/api/albums/${album.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ addPhotoIds: photoIds.slice(at, at + ALBUM_CHUNK) }),
        })
        if (!more.ok) {
          toast(await apiErrorMessage(more, `Created ${name}, but not every photo went in`), 'error')
          return
        }
      }
      toast(`Added ${them} to ${name}`, 'success')
      onAdded?.(name)
      router.refresh()
      onClose()
    } catch {
      toast('Could not reach the server', 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={photoIds.length === 1 ? 'Add to album' : `Add ${photoIds.length.toLocaleString()} photos to an album`}
    >
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
          You have no albums yet. Name one below to start one with {photoIds.length === 1 ? 'this photo' : 'these photos'}.
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

      <div className="border-t border-neutral-800 p-4">
        {creating ? (
          <div className="space-y-4">
            <div>
              <FieldLabel htmlFor={`${fid}-name`} required>Album name</FieldLabel>
              <input
                id={`${fid}-name`}
                type="text"
                autoFocus
                value={newName}
                maxLength={ALBUM_NAME_MAX}
                onChange={event => setNewName(event.target.value)}
                onKeyDown={event => { if (event.key === 'Enter') createAndAdd() }}
                placeholder="e.g. Summer 2024, Street Photography…"
                className={fieldClass}
              />
            </div>

            {/* The album wording, which is what the other three album forms
                pass. Without it the control falls back to the copy written for
                a photo — "It stays in your albums" — under a question about an
                album. */}
            <VisibilityToggle
              value={newPublic ? 'PUBLIC' : 'PRIVATE'}
              onChange={next => setNewPublic(next === 'PUBLIC')}
              label="Who can see this album"
              hint={newPublic ? 'Anyone can find this album on AvoidXray.' : 'Only you can see this album.'}
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
