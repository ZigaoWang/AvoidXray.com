'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import { useToast } from '@/components/ui/Toast'
import Button, { iconButtonClass } from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import { focusRingInset } from '@/components/ui/focus'
import { apiErrorMessage } from '@/lib/apiError'
import type { PhotoAlbum } from '@/lib/photoAlbums'
import AddToAlbumDialog from './AddToAlbumDialog'

/**
 * Which albums hold this photograph, and — for the photographer — the way out
 * of one.
 *
 * Removing a photo from an album lived in the three-dot menu at the foot of
 * the panel, which is where the site puts an item's secondary actions. It was
 * the wrong place for this one: the albums are named in a card of their own
 * further up, so the album you want to leave is on screen while the control
 * that leaves it is somewhere else entirely, behind a menu nobody opens
 * looking for it. An action belongs beside the thing it acts on, so it sits
 * on the row.
 *
 * The menu entry is gone rather than kept as a second route to the same
 * outcome: two controls doing one thing is how the actions for a photo ended
 * up scattered in the first place.
 *
 * Adding is here for the same reason. It could only be done while uploading,
 * or from the album's edit page by finding the frame again in a grid of
 * everything you have ever shot — so for the owner the card is the one place
 * that answers "which albums is this in, and how do I change that", and it
 * shows even when the answer is none.
 */
export default function PhotoAlbums({
  photoId,
  albums,
  isOwner,
}: {
  photoId: string
  /** Already filtered to what this viewer may see. */
  albums: PhotoAlbum[]
  isOwner: boolean
}) {
  const router = useRouter()
  const { toast } = useToast()
  const [removing, setRemoving] = useState<PhotoAlbum | null>(null)
  const [adding, setAdding] = useState(false)

  // Nothing to say to a visitor about a photo that is in no album of theirs to
  // see. The owner keeps the card, because for them it is also the way in.
  if (albums.length === 0 && !isOwner) return null

  async function confirmRemove() {
    if (!removing) return
    const album = removing
    try {
      const res = await fetch(`/api/albums/${album.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ removePhotoIds: [photoId] }),
      })
      if (!res.ok) {
        toast(await apiErrorMessage(res, `Could not remove it from ${album.name}`), 'error')
        return
      }
      toast(`Removed from ${album.name}. The photo is still yours.`, 'success')
      // Redraws this card without the album, rather than sending you to an
      // album you have just left.
      router.refresh()
    } catch {
      toast('Could not reach the server', 'error')
    } finally {
      setRemoving(null)
    }
  }

  return (
    <div className="bg-neutral-900 border border-neutral-800 p-4">
      <h2 className="text-xs text-neutral-500 mb-3 uppercase tracking-wide">
        {albums.length === 1 ? 'Album' : 'Albums'}
      </h2>

      {albums.length === 0 && (
        <p className="text-neutral-500 text-sm">This photo is not in an album yet.</p>
      )}

      <ul className="space-y-2">
        {albums.map(album => (
          // The border is on the row rather than the link, so it answers to
          // the remove button as well and to the keyboard focus inside it.
          <li
            key={album.id}
            className="flex items-center border border-neutral-800 hover:border-brand focus-within:border-brand transition-colors"
          >
            <Link
              href={`/albums/${album.id}`}
              className={`group flex flex-1 min-w-0 items-center gap-3 p-3 ${focusRingInset}`}
            >
              <svg className="w-4 h-4 text-neutral-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
              <span className="flex-1 min-w-0">
                <span className="flex items-center gap-2">
                  <span className="text-white text-sm font-medium truncate group-hover:text-brand transition-colors">
                    {album.name}
                  </span>
                  {/* The same badge the album list uses, so one album reads
                      the same wherever you meet it. */}
                  {!album.public && <Badge>Private</Badge>}
                </span>
                <span className="block text-neutral-500 text-xs mt-0.5">
                  {album.photoCount} {album.photoCount === 1 ? 'photo' : 'photos'}
                </span>
              </span>
              {/* The owner's row ends in the remove button instead, which
                  would otherwise be a second icon crowding a 320px panel. */}
              {!isOwner && (
                <svg className="w-4 h-4 text-neutral-600 group-hover:text-brand transition-colors flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              )}
            </Link>

            {isOwner && (
              // Named in full for anyone who cannot see which row it is on,
              // and 44px like every other icon button on the site, because a
              // control this small beside a link is one people will miss.
              <button
                type="button"
                onClick={() => setRemoving(album)}
                aria-label={`Remove this photo from ${album.name}`}
                title={`Remove from ${album.name}`}
                className={`${iconButtonClass} flex-shrink-0`}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </li>
        ))}
      </ul>

      {isOwner && (
        <div className={albums.length > 0 ? 'mt-3' : 'mt-4'}>
          <Button variant="outline" size="sm" fullWidth onClick={() => setAdding(true)}>
            + Add to album
          </Button>
        </div>
      )}

      {isOwner && (
        <AddToAlbumDialog
          open={adding}
          onClose={() => setAdding(false)}
          photoId={photoId}
          memberAlbumIds={albums.map(album => album.id)}
        />
      )}

      {/* Says what stays, because "remove" beside a photograph reads like
          losing it — the same worry the delete dialog answers from the other
          direction. */}
      <ConfirmDialog
        open={removing !== null}
        title={`Remove from “${removing?.name ?? ''}”?`}
        confirmLabel="Remove"
        busyLabel="Removing…"
        destructive
        onConfirm={confirmRemove}
        onClose={() => setRemoving(null)}
      >
        The album loses the photo. It stays on your profile, in explore and in any other
        album it is in, and you can add it back at any time.
      </ConfirmDialog>
    </div>
  )
}
