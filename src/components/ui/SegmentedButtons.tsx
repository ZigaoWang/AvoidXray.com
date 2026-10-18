import type { ReactNode } from 'react'
import { focusRingInset } from './focus'

/**
 * SegmentedLinks for a choice that stays on the page: the same row inside one
 * border, as buttons.
 *
 * The profile sort, the community notes sort, the feedback kind and the export
 * dialog's toggles were each drawn by hand. One was a copy of SegmentedLinks,
 * one an underlined uppercase row, one a set of brand red fills (red is for the
 * action a screen wants from you, not for which option is on) and one 11px text
 * in a 24px row. They pick one of a few things, so they now look like the sort
 * on the catalog pages.
 *
 * `aria-pressed` on each button says which one is on; the fill only says it to
 * people who can see it.
 */
export default function SegmentedButtons<T extends string | number | boolean>({
  label,
  labelledBy,
  options,
  active,
  onChange,
  fullWidth = false,
  className = '',
}: {
  /** Names the group to assistive technology. Use labelledBy for a visible heading. */
  label?: string
  labelledBy?: string
  options: readonly { value: T; label: ReactNode; ariaLabel?: string }[]
  active: T
  onChange: (value: T) => void
  /** Spread the options across the row, as in a dialog's narrow column. */
  fullWidth?: boolean
  className?: string
}) {
  return (
    // h-8 including the border, so the control lines up with the Filters
    // button, the chips and the toolbar search beside it.
    <div
      role="group"
      aria-label={label}
      aria-labelledby={labelledBy}
      className={`${fullWidth ? 'flex w-full' : 'inline-flex'} h-8 border border-neutral-800 ${className}`.trim()}
    >
      {options.map(option => {
        const isActive = option.value === active
        return (
          <button
            key={String(option.value)}
            type="button"
            aria-pressed={isActive}
            aria-label={option.ariaLabel}
            onClick={() => onChange(option.value)}
            className={`inline-flex h-full items-center justify-center gap-2 whitespace-nowrap px-3 text-xs transition-colors ${focusRingInset} ${
              fullWidth ? 'flex-1' : ''
            } ${isActive ? 'bg-neutral-800 text-white' : 'text-neutral-400 hover:text-white'}`}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
