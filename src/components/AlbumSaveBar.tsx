'use client'

import Button from './ui/Button'

/**
 * The album form's save button, pinned to the bottom of a phone screen.
 *
 * Below the lg breakpoint the form stacks above the photo picker, so the save
 * button sat at the top of the page while the photos being chosen ran on far
 * below it: tick photos down the page, then scroll all the way back up to
 * save. The panel's own button still serves wide screens, where it stays in
 * view beside the picker.
 */
export default function AlbumSaveBar({
  selected,
  label,
  busyLabel,
  busy,
  disabled,
  onSave,
}: {
  selected: number
  label: string
  busyLabel: string
  busy: boolean
  disabled: boolean
  onSave: () => void
}) {
  return (
    <>
      {/* Room at the end of the page, so the bar never covers the last row. */}
      <div className="h-24 lg:hidden" aria-hidden />
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-neutral-800 bg-[#0a0a0a]/95 backdrop-blur
                      pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 lg:hidden">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6">
          <p className="text-sm text-neutral-400">
            <span className="font-bold tabular-nums text-white">{selected}</span> selected
          </p>
          <Button onClick={onSave} disabled={disabled} size="sm">
            {busy ? busyLabel : label}
          </Button>
        </div>
      </div>
    </>
  )
}
