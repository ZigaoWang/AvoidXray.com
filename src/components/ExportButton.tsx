'use client'
import { useState } from 'react'
import ExportDialog, { type ExportPhoto } from './ExportDialog'
import Button from './ui/Button'
import ConfirmDialog from './ui/ConfirmDialog'

/**
 * Opens the export dialog for one photograph, or for a set of them.
 *
 * Takes the same list the dialog does, so every entry point mounts this rather
 * than something parallel to it: the photo page passes one, and the photo
 * manager's selection bar passes what is selected.
 *
 * Its shape is the caller's, because those two places are not alike — a
 * full-width outline button in a stack of them on the photo page, and a small
 * one in a row of small ones along the bottom of the manager.
 */
export default function ExportButton({
  photos,
  label = 'Export',
  size = 'md',
  fullWidth = true,
  confirm,
}: {
  photos: ExportPhoto[]
  label?: string
  size?: 'sm' | 'md'
  fullWidth?: boolean
  /**
   * Asked before the panel opens, when what will be exported is less than what
   * was asked for.
   *
   * A selection can be larger than one export will take, and the panel used to
   * explain that once it was already open, in a line under the controls. That
   * is the wrong moment and the wrong shape: it reads as a footnote about a
   * decision already made rather than as the decision. Six hundred selected and
   * sixty exported is worth a yes or no, in the same confirmation the delete
   * beside it uses.
   */
  confirm?: { title: string; body: React.ReactNode; label: string }
}) {
  const [open, setOpen] = useState(false)
  const [asking, setAsking] = useState(false)

  if (!photos.length) return null

  return (
    <>
      {/* The shared button, at the shared height.
          It was hand-rolled at py-2 with a brand-red border, directly under a
          hand-rolled py-2.5 link and above a py-2 toggle: three full-width
          controls in a stack, no two the same height, and the only resting
          brand color on the page was on a download. Red is reserved for the
          one action a screen wants from you, and taking a copy of someone
          else's photograph is not it. */}
      <Button
        variant="outline"
        size={size}
        fullWidth={fullWidth}
        onClick={() => (confirm ? setAsking(true) : setOpen(true))}
      >
        {label}
      </Button>

      {confirm && (
        <ConfirmDialog
          open={asking}
          title={confirm.title}
          confirmLabel={confirm.label}
          onConfirm={() => { setAsking(false); setOpen(true) }}
          onClose={() => setAsking(false)}
        >
          {confirm.body}
        </ConfirmDialog>
      )}

      {open && <ExportDialog photos={photos} onClose={() => setOpen(false)} />}
    </>
  )
}
