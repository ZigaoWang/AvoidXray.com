'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useToast } from '@/components/ui/Toast'

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
  visibility: 'PUBLIC' | 'PRIVATE'
  /** Set when the photo was reached from an album, enabling "remove from album". */
  albumId?: string
  albumName?: string
}) {
  const router = useRouter()
  const { toast } = useToast()
  const [current, setCurrent] = useState(visibility)
  const [saving, setSaving] = useState(false)

  const isPrivate = current === 'PRIVATE'

  const toggleVisibility = async () => {
    if (saving) return
    const next = isPrivate ? 'PUBLIC' : 'PRIVATE'
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
      setCurrent(isPrivate ? 'PRIVATE' : 'PUBLIC')
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
      <button
        type="button"
        onClick={toggleVisibility}
        disabled={saving}
        aria-pressed={isPrivate}
        className={`w-full flex items-center gap-3 p-3 border text-left transition-colors disabled:opacity-50 ${
          isPrivate
            ? 'border-[#D32F2F] bg-[#D32F2F]/5'
            : 'border-neutral-800 hover:border-neutral-600'
        }`}
      >
        <svg
          className={`w-4 h-4 flex-shrink-0 ${isPrivate ? 'text-[#D32F2F]' : 'text-neutral-500'}`}
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          viewBox="0 0 24 24"
        >
          {isPrivate ? (
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
            />
          ) : (
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 118 0"
            />
          )}
        </svg>
        <span className="min-w-0">
          <span className="block text-sm text-white">
            {isPrivate ? 'Private' : 'Public'}
          </span>
          <span className="block text-xs text-neutral-500">
            {isPrivate
              ? 'Only you can see this. It stays in your albums.'
              : 'Anyone can find this on AvoidXray.'}
          </span>
        </span>
      </button>

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
