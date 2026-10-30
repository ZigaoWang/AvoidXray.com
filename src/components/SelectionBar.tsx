import type { ReactNode } from 'react'
import { focusRing } from '@/components/ui/focus'

/**
 * Room under a grid for the bar, so the last row can scroll out from under
 * it. On a phone the bar is about 125px plus the home indicator.
 */
export const SELECTION_BAR_ROOM = 'pb-40 sm:pb-24'

/**
 * One line of actions on whatever is selected: Your photos, the library, an
 * import, the Trash.
 *
 * It names the selection and offers what can be done with it. Editing fields
 * open in a dialog rather than living here, which made the bar taller than a
 * phone's screen. Actions sit two by two on a phone, so four are four equal
 * targets instead of a ragged wrap, and in one row from sm.
 */
export default function SelectionBar({ count, hidden = 0, onClear, children }: {
  count: number
  /** How many of the selected the current filters hide: still selected, and still acted on. */
  hidden?: number
  onClear: () => void
  children: ReactNode
}) {
  if (count === 0) return null
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-neutral-800 bg-[#0a0a0a]/95 backdrop-blur
                    pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-3 gap-y-2 px-6">
        <p className="flex items-center gap-2 text-sm" role="status" aria-live="polite">
          <span className="font-bold tabular-nums text-white">{count.toLocaleString()}</span>
          <span className="text-neutral-400">selected{hidden > 0 && `, ${hidden.toLocaleString()} hidden by filters`}</span>
          <button
            type="button"
            onClick={onClear}
            className={`-my-2 px-2 py-2 text-xs text-neutral-400 underline underline-offset-4 hover:text-white ${focusRing}`}
          >
            Clear
          </button>
        </p>
        <div className="grid w-full grid-cols-2 gap-2 sm:ml-auto sm:flex sm:w-auto sm:items-center">
          {children}
        </div>
      </div>
    </div>
  )
}
