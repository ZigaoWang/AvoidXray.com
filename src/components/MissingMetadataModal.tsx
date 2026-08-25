'use client'
import Button from '@/components/ui/Button'

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
 */
type Props = {
  missingFields: ('camera' | 'film')[]
  onContinue: () => void
  onCancel: () => void
}

export default function MissingMetadataModal({ missingFields, onContinue, onCancel }: Props) {
  const hasCamera = missingFields.includes('camera')
  const hasFilm = missingFields.includes('film')
  const missing = hasCamera && hasFilm ? 'film stock or camera' : hasCamera ? 'camera' : 'film stock'

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-neutral-900 border border-neutral-800 w-full max-w-sm">
        <div className="p-6">
          <h2 className="text-xl font-bold text-white mb-2">What did you shoot this on?</h2>
          <p className="text-neutral-400 text-sm leading-relaxed mb-6">
            You haven&rsquo;t picked a {missing}. It&rsquo;s how people find your photos, and the
            main reason anyone browses here.
          </p>

          <Button onClick={onCancel} fullWidth>
            Add details
          </Button>

          <button
            type="button"
            onClick={onContinue}
            className="mt-3 block w-full text-center text-sm text-neutral-500 hover:text-white transition-colors"
          >
            I&rsquo;m not sure, publish anyway
          </button>
        </div>
      </div>
    </div>
  )
}
