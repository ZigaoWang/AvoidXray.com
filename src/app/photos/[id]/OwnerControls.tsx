'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useToast } from '@/components/ui/Toast'
import VisibilityToggle, { type Visibility } from '@/components/ui/VisibilityToggle'
import { apiErrorMessage } from '@/lib/apiError'

/**
 * Who can see this photo.
 *
 * Delete used to be the only owner control, which made it the only way to take
 * a photo out of public view, and it removed the photo from the whole site.
 * People reached for it wanting "hide this" and lost the photo.
 *
 * Visibility stays a visible switch rather than moving into the actions menu:
 * it is a state you need to be able to read at a glance, not an action you go
 * looking for. Delete and "remove from album" did move there.
 */
export default function OwnerControls({
  photoId,
  visibility,
}: {
  photoId: string
  visibility: Visibility
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

    // The optimistic update above has to be undone on *any* failure, not just
    // on a response that says no. A request that threw left the switch reading
    // "Private" for a photo that was still public, and `saving` stuck true, so
    // the control could not be used again to correct it.
    try {
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
        toast(await apiErrorMessage(res, 'Could not change who can see this photo'), 'error')
      }
    } catch {
      setCurrent(previous)
      toast('Could not reach the server', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <VisibilityToggle
      value={current}
      onChange={(next) => toggleVisibility(next as Visibility)}
      disabled={saving}
      label={null}
    />
  )
}
