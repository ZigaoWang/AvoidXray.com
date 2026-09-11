'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { apiErrorMessage } from '@/lib/apiError'
import ItemActions from './ItemActions'
import ConfirmDialog from './ui/ConfirmDialog'
import { useToast } from './ui/Toast'

/**
 * An album owner's actions, wherever one album is shown.
 *
 * These were two icon buttons revealed by `opacity-0 group-hover:opacity-100`,
 * which meant they did not exist on a touch screen: there is no hover, so a
 * phone could not edit or delete an album at all. They also used the browser's
 * own confirm and alert boxes.
 *
 * Now the same always-visible menu every other item uses.
 */
export default function AlbumActions({
  albumId,
  albumName,
  className = 'absolute top-1 right-1 z-10',
  afterDelete,
}: {
  albumId: string
  albumName: string
  /** Defaults to the corner of a card; override to sit in a row of controls. */
  className?: string
  /**
   * Where to go once the album is gone. The grid can stay where it is and
   * re-render, but the album's own page cannot: refreshing it would ask for
   * the album that was just deleted and land the owner on a 404.
   */
  afterDelete?: string
}) {
  const router = useRouter()
  const { toast } = useToast()
  const [confirming, setConfirming] = useState(false)

  async function deleteAlbum() {
    try {
      const res = await fetch(`/api/albums/${albumId}`, { method: 'DELETE' })
      if (!res.ok) {
        toast(await apiErrorMessage(res, 'Could not delete the album'), 'error')
        setConfirming(false)
        return
      }
      toast('Album deleted. The photos are still yours.', 'success')
      setConfirming(false)
      if (afterDelete) router.push(afterDelete)
      else router.refresh()
    } catch {
      toast('Could not reach the server', 'error')
      setConfirming(false)
    }
  }

  return (
    // Stops a click on the menu from following the card's link to the album.
    // Harmless where there is no link around it.
    <div
      className={className}
      onClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
      }}
    >
      <ItemActions
        label={`Actions for ${albumName}`}
        copyLink={`/albums/${albumId}`}
        items={[
          { label: 'Edit album', onSelect: () => router.push(`/albums/${albumId}/edit`) },
          {
            label: 'Delete album',
            destructive: true,
            startsGroup: true,
            onSelect: () => setConfirming(true),
          },
        ]}
      />

      <ConfirmDialog
        open={confirming}
        title={`Delete “${albumName}”?`}
        confirmLabel="Delete"
        busyLabel="Deleting…"
        destructive
        onConfirm={deleteAlbum}
        onClose={() => setConfirming(false)}
      >
        The album is removed, but the photos in it are not. They stay on your profile and
        everywhere else they appear.
      </ConfirmDialog>
    </div>
  )
}
