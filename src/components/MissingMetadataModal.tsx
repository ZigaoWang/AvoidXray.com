'use client'
import { useRef } from 'react'
import Button from '@/components/ui/Button'
import Modal from '@/components/ui/Modal'

/**
 * The prompt between "photos uploaded" and "photos published" when the film
 * stock or camera is blank.
 *
 * It used to be titled "Missing Information" and argued that filling these in
 * "helps others discover your photos", which is a pitch, not a rule. Then it
 * over-corrected into three paragraphs making the same point twice and a
 * secondary action set in shouting caps.
 *
 * One line, two choices. Skipping still works, because a thrifted camera with
 * half a roll already in it is a real situation, but it reads as an answer
 * rather than a shrug.
 *
 * It says how many photos it is talking about, because it is now possible for
 * it to be talking about three of twelve.
 */
type Props = {
  /**
   * How many of the photos about to publish have no camera and no film stock,
   * counted per photo rather than from the batch default — someone who tagged
   * each frame by hand has picked a camera, and was being told they had not.
   */
  missing: { camera: number; film: number; total: number }
  onContinue: () => void
  onCancel: () => void
}

/** "3 of 12 photos have no camera", and the two ends of that range. */
function shortfall(count: number, total: number, field: string): string {
  if (count === total) {
    return total === 1 ? `This photo has no ${field}` : `None of these ${total} photos have a ${field}`
  }
  return `${count} of ${total} ${total === 1 ? 'photo has' : 'photos have'} no ${field}`
}

export default function MissingMetadataModal({ missing, onContinue, onCancel }: Props) {
  const lines = [
    missing.camera > 0 ? shortfall(missing.camera, missing.total, 'camera') : null,
    missing.film > 0 ? shortfall(missing.film, missing.total, 'film stock') : null,
  ].filter(Boolean)
  const addRef = useRef<HTMLButtonElement>(null)

  // The parent mounts this only when it is needed, so it is open whenever it
  // renders. Escape and the backdrop go back to the form rather than
  // publishing: this appears in the middle of an upload, and a prompt dismissed
  // in a hurry should leave the photos unpublished rather than commit them with
  // the field still blank. Focus starts on Add details for the same reason.
  return (
    <Modal open onClose={onCancel} title="What did you shoot this on?" initialFocus={addRef}>
      <div className="p-4">
        <p className="text-neutral-400 text-sm leading-relaxed mb-6">
          {lines.join('. ')}. It&rsquo;s how people find your photos, and the main reason anyone
          browses here.
        </p>

        <Button ref={addRef} onClick={onCancel} fullWidth>
          Add details
        </Button>

        <Button variant="ghost" size="sm" onClick={onContinue} fullWidth className="mt-2">
          Publish without {missing.camera > 0 && missing.film > 0 ? 'them' : 'it'}
        </Button>
      </div>
    </Modal>
  )
}
