import FieldLabel from './FieldLabel'

/**
 * Who can see a photo. The same control on the upload page, the edit page and
 * the photo itself, so the setting looks and behaves the same wherever it is
 * changed.
 *
 * Controlled on purpose: the upload form holds it in local state until publish,
 * while the photo page saves it immediately. Persistence is the caller's job.
 */

export type Visibility = 'PUBLIC' | 'PRIVATE'
/** '' means "whatever the default for this batch is" — see `allowInherit`. */
export type VisibilityValue = Visibility | ''

const COPY: Record<Visibility, string> = {
  PUBLIC: 'Anyone can find this on AvoidXray.',
  PRIVATE: 'Only you can see this. It stays in your albums.',
}

function LockIcon({ open, className }: { open: boolean; className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d={
          open
            ? 'M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 118 0'
            : 'M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z'
        }
      />
    </svg>
  )
}

export default function VisibilityToggle({
  value,
  onChange,
  label = 'Who can see this',
  /** Adds a "Default" option, for per-photo overrides in a batch upload. */
  allowInherit = false,
  /** What "Default" resolves to, so the description can say what it means. */
  inheritedValue = 'PUBLIC',
  disabled = false,
  hint,
}: {
  value: VisibilityValue
  onChange: (next: VisibilityValue) => void
  label?: string | null
  allowInherit?: boolean
  inheritedValue?: Visibility
  disabled?: boolean
  hint?: string
}) {
  const options: { value: VisibilityValue; text: string }[] = [
    ...(allowInherit ? [{ value: '' as VisibilityValue, text: 'Default' }] : []),
    { value: 'PUBLIC', text: 'Public' },
    { value: 'PRIVATE', text: 'Private' },
  ]

  const effective: Visibility = value === '' ? inheritedValue : value

  return (
    <div>
      {label && <FieldLabel>{label}</FieldLabel>}

      <div className="flex border border-neutral-700" role="group" aria-label={label ?? 'Visibility'}>
        {options.map((option) => {
          const active = value === option.value
          return (
            <button
              key={option.value || 'inherit'}
              type="button"
              onClick={() => onChange(option.value)}
              disabled={disabled}
              aria-pressed={active}
              className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                active
                  ? option.value === 'PRIVATE'
                    ? 'bg-[#D32F2F] text-white'
                    : 'bg-neutral-700 text-white'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              {option.value !== '' && (
                <LockIcon open={option.value === 'PUBLIC'} className="w-3.5 h-3.5" />
              )}
              {option.text}
            </button>
          )
        })}
      </div>

      <p className="mt-1.5 text-xs text-neutral-600">
        {hint ?? (value === '' ? `Default for this batch: ${COPY[effective].toLowerCase()}` : COPY[effective])}
      </p>
    </div>
  )
}
