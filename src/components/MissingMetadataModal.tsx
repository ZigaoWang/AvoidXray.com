'use client'

type Props = {
  missingFields: ('camera' | 'film')[]
  onContinue: () => void
  onCancel: () => void
}

export default function MissingMetadataModal({ missingFields, onContinue, onCancel }: Props) {
  const hasCamera = missingFields.includes('camera')
  const hasFilm = missingFields.includes('film')

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-neutral-900 border border-neutral-800 p-6 max-w-md w-full">
        <h2 className="text-2xl font-bold text-white mb-2">
          Missing Information
        </h2>
        <p className="text-neutral-500 text-sm mb-6">
          Camera and film stock info helps others discover your photos and learn about different gear.
        </p>

        <div className="space-y-2 mb-6">
          {hasCamera && (
            <div className="bg-neutral-800 border border-neutral-700 p-3 flex items-center gap-3">
              <svg className="w-5 h-5 text-neutral-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <span className="text-white text-sm">Camera not selected</span>
            </div>
          )}
          {hasFilm && (
            <div className="bg-neutral-800 border border-neutral-700 p-3 flex items-center gap-3">
              <svg className="w-5 h-5 text-neutral-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z" />
              </svg>
              <span className="text-white text-sm">Film stock not selected</span>
            </div>
          )}
        </div>

        <div className="bg-neutral-800 border border-neutral-700 p-3 mb-6">
          <p className="text-neutral-400 text-xs">
            This gallery is built around film photography. Adding gear info makes your photos more discoverable.
          </p>
        </div>

        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 bg-[#D32F2F] hover:bg-[#B71C1C] text-white px-4 py-3 font-medium"
          >
            Go Back
          </button>
          <button
            onClick={onContinue}
            className="bg-neutral-800 hover:bg-neutral-700 text-white px-4 py-3 font-medium"
          >
            Skip
          </button>
        </div>
      </div>
    </div>
  )
}
