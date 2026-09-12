'use client'
import { useState } from 'react'
import ExportDialog, { type ExportPhoto } from './ExportDialog'
import Button from './ui/Button'

/**
 * Opens the export dialog for one photograph, or for a set of them.
 *
 * Takes the same list the dialog does, so the album and multi-select entry
 * points that are coming mount this rather than something parallel to it.
 */
export default function ExportButton({
  photos,
  label = 'Export',
}: {
  photos: ExportPhoto[]
  label?: string
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
      <Button variant="outline" size="md" fullWidth onClick={() => setOpen(true)}>
        {label}
      </Button>

      {open && <ExportDialog photos={photos} onClose={() => setOpen(false)} />}
    </>
  )
}
