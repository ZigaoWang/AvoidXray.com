'use client'
import { useState } from 'react'
import ExportDialog, { type ExportPhoto } from './ExportDialog'
import Button from './ui/Button'

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
}: {
  photos: ExportPhoto[]
  label?: string
  size?: 'sm' | 'md'
  fullWidth?: boolean
}) {
  const [open, setOpen] = useState(false)

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
      <Button variant="outline" size={size} fullWidth={fullWidth} onClick={() => setOpen(true)}>
        {label}
      </Button>

      {open && <ExportDialog photos={photos} onClose={() => setOpen(false)} />}
    </>
  )
}
