'use client'
import Link from 'next/link'
import Button from '@/components/ui/Button'

/**
 * The gate between "photos uploaded" and "photos published" when the film
 * stock or camera is blank.
 *
 * It used to be titled "Missing Information" and argued that filling these in
 * "helps others discover your photos". Nothing said the site was for film, so
 * someone could upload phone photos, read this, hit Skip, and never once be
 * told they were in the wrong room.
 *
 * Skipping is still allowed, because half a thrifted roll with no label is a
 * real situation and refusing it outright loses genuine uploads. But it reads
 * as a deliberate "I'm not sure" rather than a shrug, and what the fields are
 * for is stated before the button.
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
      <div className="bg-neutral-900 border border-neutral-800 w-full max-w-md">
        <div className="p-6">
          <p className="text-[#D32F2F] text-xs uppercase tracking-widest font-bold mb-3">
            Film only
          </p>
          <h2 className="text-2xl font-bold text-white mb-3 leading-tight">
            What did you shoot this on?
          </h2>
          <p className="text-neutral-400 text-sm leading-relaxed mb-4">
            You haven&rsquo;t set a {missing}. This is the part people actually come here for.
            Someone is deciding whether a roll of Gold 200 is worth it, and your photos are the
            argument. Without the tags they never find them.
          </p>
          <p className="text-neutral-500 text-sm leading-relaxed mb-6">
            If these were taken on a phone, they belong somewhere else.{' '}
            <Link
              href="/guidelines"
              className="text-neutral-300 hover:text-white underline underline-offset-2"
            >
              What belongs here
            </Link>
          </p>

          <div className="flex flex-col gap-2">
            <Button onClick={onCancel} fullWidth>
              Add the details
            </Button>
            <Button onClick={onContinue} variant="ghost" size="sm" fullWidth>
              I&rsquo;m not sure what I shot
            </Button>
          </div>

          <p className="text-neutral-600 text-xs text-center mt-3">
            Mystery roll? Publish anyway and tag it later once you work it out.
          </p>
        </div>
      </div>
    </div>
  )
}
