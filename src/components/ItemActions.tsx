'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { ReportTarget } from '@/lib/reports'
import { apiErrorMessage } from '@/lib/apiError'
import OverflowMenu, { type MenuItem } from './ui/OverflowMenu'
import ReportDialog from './ReportDialog'
import BlockDialog from './BlockDialog'
import { useToast } from './ui/Toast'

/**
 * Every action that belongs to one item, behind one three-dot menu.
 *
 * These used to be loose text links placed by whichever component happened to
 * own them: Report and Block sitting beside a name on a profile, Report on
 * every comment, "Report this photo" in its own bordered row. The set differed
 * per surface, the wording differed per surface, and each one competed with
 * the content it belonged to.
 *
 * One component means the menu looks and behaves the same everywhere, and a
 * new action is added in one place rather than four.
 */
export default function ItemActions({
  label,
  report,
  block,
  items = [],
  align,
}: {
  /** What the menu acts on, announced to screen readers: "Comment actions". */
  label: string
  report?: { targetType: ReportTarget; targetId: string }
  block?: { username: string; initiallyBlocked: boolean }
  /** Surface-specific extras, e.g. Delete on your own comment. */
  items?: MenuItem[]
  align?: 'left' | 'right'
}) {
  const router = useRouter()
  const { toast } = useToast()
  const [reporting, setReporting] = useState(false)
  const [confirmingBlock, setConfirmingBlock] = useState(false)
  const [blocked, setBlocked] = useState(block?.initiallyBlocked ?? false)
  const [busy, setBusy] = useState(false)

  // Unblocking takes nothing away, so it happens straight from the menu.
  // Blocking goes through BlockDialog, which explains what it also removes.
  async function unblock() {
    if (!block || busy) return
    setBusy(true)
    try {
      const res = await fetch('/api/blocks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: block.username }),
      })
      if (!res.ok) {
        toast(await apiErrorMessage(res, 'Could not update'), 'error')
        return
      }
      setBlocked(false)
      toast(`Unblocked @${block.username}`, 'success')
      // Their photos become visible again, so the page behind has to catch up.
      router.refresh()
    } catch {
      toast('Could not reach the server', 'error')
    } finally {
      setBusy(false)
    }
  }

  const menuItems: MenuItem[] = [
    ...items,
    ...(report ? [{ label: 'Report', onSelect: () => setReporting(true) }] : []),
    ...(block
      ? [
          blocked
            ? { label: 'Unblock', onSelect: unblock, disabled: busy }
            : { label: 'Block', onSelect: () => setConfirmingBlock(true), destructive: true },
        ]
      : []),
  ]

  return (
    <>
      <OverflowMenu items={menuItems} label={label} align={align} />

      {report && (
        <ReportDialog
          targetType={report.targetType}
          targetId={report.targetId}
          open={reporting}
          onClose={() => setReporting(false)}
        />
      )}

      {block && (
        <BlockDialog
          username={block.username}
          open={confirmingBlock}
          onClose={() => setConfirmingBlock(false)}
          onBlocked={() => {
            setBlocked(true)
            router.refresh()
          }}
        />
      )}
    </>
  )
}
