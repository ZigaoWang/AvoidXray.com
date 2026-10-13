'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Button from './ui/Button'
import PeopleList, { type Person } from './PeopleList'
import { useToast } from './ui/Toast'
import { apiErrorMessage } from '@/lib/apiError'

/**
 * The accounts you have blocked, each with Unblock.
 *
 * The only way to unblock someone was the menu on their profile, which a
 * block hides from you, so you had to remember who it was and find them.
 */
export default function BlockedAccounts() {
  const router = useRouter()
  const { toast } = useToast()
  const [busy, setBusy] = useState<string | null>(null)

  async function unblock(person: Person, remove: () => void) {
    setBusy(person.username)
    try {
      // The endpoint toggles, and everyone listed here is blocked, so this
      // always unblocks.
      const res = await fetch('/api/blocks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: person.username }),
      })
      if (!res.ok) {
        toast(await apiErrorMessage(res, 'Could not unblock'), 'error')
        return
      }
      remove()
      toast(`Unblocked @${person.username}`, 'success')
      router.refresh()
    } catch {
      toast('Could not reach the server', 'error')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="border border-neutral-800 bg-neutral-900">
      <PeopleList
        url="/api/blocks"
        emptyMessage="You have not blocked anyone"
        action={(person, remove) => (
          <Button
            variant="outline"
            size="sm"
            onClick={() => unblock(person, remove)}
            disabled={busy === person.username}
          >
            {busy === person.username ? 'Unblocking…' : 'Unblock'}
          </Button>
        )}
      />
    </div>
  )
}
