'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import ItemActions from '@/components/ItemActions'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import { useToast } from '@/components/ui/Toast'
import type { MenuItem } from '@/components/ui/OverflowMenu'
import { apiErrorMessage } from '@/lib/apiError'

/**
 * Everything you can do to one photo, in one menu.
 *
 * The owner's Delete and "Remove from album" were text links under the
 * visibility switch, while Report was a bordered row further down the page, so
 * the actions for a single photo were in two places depending on who was
 * looking. Visibility stays a visible switch because it is a state you need to
 * see, not an action you go looking for.
 */
export default function PhotoActions({
  photoId,
  ownerUsername,
  isOwner,
  isPrivate,
  usesTrash,
  canBlock,
  initiallyBlocked,
}: {
  photoId: string
  ownerUsername: string
  isOwner: boolean
  isPrivate: boolean
  /** The owner has the library, where a deleted photo waits in the Trash. */
  usesTrash: boolean
  /** Signed in and looking at someone else's photo. */
  canBlock: boolean
  initiallyBlocked: boolean
}) {
  const router = useRouter()
  const { toast } = useToast()
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  async function deletePhoto() {
    // A throw here propagated into ConfirmDialog, which resets its own busy
    // flag in a finally and says nothing, so a failed delete looked like a
    // dialog that had simply ignored the button.
    try {
      const res = await fetch(`/api/photos/${photoId}`, { method: 'DELETE' })
      if (res.ok) {
        // To the owner's own grid, where the photo is visibly gone, and said
        // in words. The homepage it used to land on showed neither.
        toast(usesTrash ? 'Moved to Trash' : 'Photo deleted', 'success')
        router.push(`/${ownerUsername}`)
        return
      }
      toast(await apiErrorMessage(res, 'Could not delete the photo'), 'error')
    } catch {
      toast('Could not reach the server', 'error')
    }
    setConfirmingDelete(false)
  }

  // Album membership is managed on the Albums card, beside the albums it
  // names, rather than from here.
  const ownerItems: MenuItem[] = isOwner
    ? [
        {
          label: 'Delete photo',
          onSelect: () => setConfirmingDelete(true),
          destructive: true,
          startsGroup: true,
        },
      ]
    : []

  return (
    <>
      <ItemActions
        label="Photo actions"
        copyLink={`/photos/${photoId}`}
        copyLinkPrivate={isPrivate}
        items={ownerItems}
        // You cannot report or block yourself, and neither is offered on your
        // own photo.
        report={isOwner ? undefined : { targetType: 'photo', targetId: photoId }}
        block={canBlock ? { username: ownerUsername, initiallyBlocked } : undefined}
      />

      {/* Spells out that this is not the same as making it private, because
          people reached for delete wanting "hide this" and lost the photo. */}
      <ConfirmDialog
        open={confirmingDelete}
        title={usesTrash ? 'Move this photo to the Trash?' : 'Delete this photo?'}
        confirmLabel={usesTrash ? 'Move to Trash' : 'Delete'}
        busyLabel={usesTrash ? 'Moving…' : 'Deleting…'}
        onConfirm={deletePhoto}
        onClose={() => setConfirmingDelete(false)}
      >
        {usesTrash ? (
          <p className="mb-3">
            It leaves every album, your profile and explore at once. You can restore it from the
            Trash in your library for 30 days, after which it is deleted for good.
          </p>
        ) : (
          <p className="mb-3">
            It will be removed from AvoidXray entirely, including every album, your profile and
            explore. This cannot be undone.
          </p>
        )}
        <p>To take it out of public view instead, close this and set it to Private.</p>
      </ConfirmDialog>
    </>
  )
}
