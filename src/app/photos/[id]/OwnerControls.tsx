'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useToast } from '@/components/ui/Toast'
import VisibilityToggle, { type Visibility } from '@/components/ui/VisibilityToggle'

/**
 * The owner's controls on a photo.
 *
 * Delete used to be the only one, which made it the only way to take a photo
 * out of public view — and it removed the photo from the whole site, albums
 * included. People reached for it wanting "hide this" and lost the photo.
 *
 * Visibility is now its own control and reads as reversible, and delete says
 * plainly what it does before it does it.
 */
export default function OwnerControls({
  photoId,
  visibility,
  albumId,
  albumName,
}: {
  photoId: string
  visibility: Visibility
  /** Set when the photo was reached from an album, enabling "remove from album". */
  albumId?: string
  albumName?: string
}) {
  const router = useRouter()
  const { toast } = useToast()
  const [current, setCurrent] = useState<Visibility>(visibility)
  const [saving, setSaving] = useState(false)

  const toggleVisibility = async (next: Visibility) => {
    if (saving || next === current) return
    const previous = current
    setSaving(true)
    // Optimistic: the switch is the feedback, so it should not lag the request.
    setCurrent(next)

    const res = await fetch(`/api/photos/${photoId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ visibility: next }),
    })

    if (res.ok) {
      toast(
        next === 'PRIVATE'
          ? 'Only you can see this photo now'
          : 'This photo is public again',
        'success'
      )
      router.refresh()
    } else {
      setCurrent(previous)
      toast('Could not change who can see this photo', 'error')
    }
    setSaving(false)
  }

  const removeFromAlbum = async () => {
    if (!albumId || saving) return
    setSaving(true)
    const res = await fetch(`/api/albums/${albumId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ removePhotoIds: [photoId] }),
    })
    if (res.ok) {
      toast('Removed from the album. The photo is still yours.', 'success')
      router.push(`/albums/${albumId}`)
    } else {
      toast('Could not remove it from the album', 'error')
      setSaving(false)
    }
  }

  const deletePhoto = async () => {
    const confirmed = confirm(
      'Delete this photo permanently?\n\n' +
        'It will be removed from AvoidXray entirely — every album, your ' +
        'profile, and explore. This cannot be undone.\n\n' +
        'To take it out of public view instead, use Private.'
    )
    if (!confirmed) return
    const res = await fetch(`/api/photos/${photoId}`, { method: 'DELETE' })
    if (res.ok) {
      router.push('/')
    } else {
      toast('Could not delete the photo', 'error')
    }
  }

  return (
    <div className="space-y-3">
      <VisibilityToggle
        value={current}
        onChange={(next) => toggleVisibility(next as Visibility)}
        disabled={saving}
        label={null}
      />

      <div className="flex items-center gap-4">
        {albumId && (
          <button
            type="button"
            onClick={removeFromAlbum}
            disabled={saving}
            className="text-sm text-neutral-400 hover:text-white transition-colors disabled:opacity-50"
            title={albumName ? `Remove from ${albumName}, keeping the photo` : undefined}
          >
            Remove from album
          </button>
        )}
        <button
          type="button"
          onClick={deletePhoto}
          className="text-sm text-[#D32F2F] hover:text-white transition-colors font-medium"
        >
          Delete
        </button>
      </div>
    </div>
  )
}
