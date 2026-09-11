import { ButtonLink } from './Button'

/**
 * What a list shows when it has nothing in it.
 *
 * There were three shapes of this. The albums page and the photo grid each
 * drew an icon, a line of explanation and a button; the film and camera
 * indexes drew one gray sentence in a dashed box. That mattered most in the
 * case they handled worst — "No cameras match this filter" with nothing to
 * press, which is the one empty state a reader has to get *out* of.
 */
export default function EmptyState({
  icon,
  message,
  hint,
  action,
  size = 'default',
}: {
  /** Optional glyph. Omitted where the surrounding page already has one. */
  icon?: React.ReactNode
  message: string
  /** A second line, for the states that have advice as well as a fact. */
  hint?: string
  /** The way forward. An empty state without one is a dead end. */
  action?: { href: string; label: string }
  /**
   * `compact` for a state that stands in for a section rather than a page.
   * Same box, less air: a full-height one inside the notes panel or a stats
   * strip reads as though the page failed to load.
   */
  size?: 'default' | 'compact'
}) {
  return (
    <div
      className={`border border-dashed border-neutral-800 px-4 text-center ${
        size === 'compact' ? 'py-12' : 'py-24'
      }`}
    >
      {icon && <div className="mx-auto mb-4 flex justify-center text-neutral-700">{icon}</div>}
      <p className={`text-neutral-500 ${hint ? 'mb-2' : action ? 'mb-4' : ''}`}>{message}</p>
      {hint && <p className={`text-sm text-neutral-600 ${action ? 'mb-4' : ''}`}>{hint}</p>}
      {action && (
        <ButtonLink href={action.href} variant="outline" size="sm">
          {action.label}
        </ButtonLink>
      )}
    </div>
  )
}

/** The film canister used across the film surfaces. */
export function FilmIcon() {
  return (
    <svg className="h-16 w-16" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
    </svg>
  )
}

/** The photo stack used wherever a list of photographs is empty. */
export function PhotoIcon() {
  return (
    <svg className="h-16 w-16" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  )
}

/** The camera body used across the camera surfaces. */
export function CameraIcon() {
  return (
    <svg className="h-16 w-16" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  )
}
