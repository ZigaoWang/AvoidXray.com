'use client'

import ExportButton from '@/components/ExportButton'
import type { ExportPhoto } from '@/components/ExportDialog'
import { useToast } from '@/components/ui/Toast'
import { MAX_BATCH } from '@/lib/exportBatch'

/**
 * Export for a selection, in the selection bar of Your photos and the library.
 *
 * Asked rather than announced when a selection is larger than one export
 * takes: one press exports sixty, Select all reaches thousands, and an export
 * cannot include a photograph it cannot describe, because the proportions and
 * the gear come from the pages the browser has fetched. Finding out from the
 * zip is the bad outcome.
 */
export default function ExportSelectionButton({ photos, selectedCount, onExportedBatch }: {
  /** The selected photos this page can describe, in the order shown. */
  photos: ExportPhoto[]
  selectedCount: number
  /** Called with the ids just exported when more were selected than one export takes. */
  onExportedBatch: (ids: string[]) => void
}) {
  const { toast } = useToast()
  const exporting = photos.slice(0, MAX_BATCH)
  const short = selectedCount - exporting.length
  return (
    <ExportButton
      photos={exporting}
      label="Export"
      size="sm"
      fullWidth={false}
      confirm={short > 0 ? {
        title: `Export the first ${exporting.length}?`,
        body: `${selectedCount} photos are selected, and one export takes ${MAX_BATCH} at a time. The other ${short} stay selected, so pressing Export again takes the next ${Math.min(MAX_BATCH, short)}.`,
        label: `Export ${exporting.length}`,
      } : undefined}
      // Taken out of the selection once they are in an archive, so the next
      // press carries on rather than building the same sixty again. Only when
      // there were more than one export takes: somebody who exported exactly
      // what they picked may want to file the same set next.
      onExported={short > 0 ? ids => {
        onExportedBatch(ids)
        toast(`Exported ${ids.length}. ${(selectedCount - ids.length).toLocaleString()} still selected.`, 'success')
      } : undefined}
    />
  )
}
