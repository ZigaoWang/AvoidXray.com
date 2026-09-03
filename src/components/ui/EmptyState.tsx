import { ButtonLink } from './Button'

/**
 * What a list shows when it has nothing in it.
 *
 * There were three shapes of this. The albums page and the photo grid each
 * drew an icon, a line of explanation and a button; the film and camera
 * indexes drew one grey sentence in a dashed box. That mattered most in the
 * case they handled worst — "No cameras match this filter" with nothing to
 * press, which is the one empty state a reader has to get *out* of.
 */
export default function EmptyState({
  icon,
  message,
  action,
}: {
  /** Optional glyph. Omitted where the surrounding page already has one. */
  icon?: React.ReactNode
  message: string
  /** The way forward. An empty state without one is a dead end. */
  action?: { href: string; label: string }
}) {
  return (
    <div className="border border-dashed border-neutral-800 py-24 text-center">
      {icon && <div className="mx-auto mb-4 flex justify-center text-neutral-700">{icon}</div>}
      <p className="mb-4 text-neutral-500">{message}</p>
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

/** The camera body used across the camera surfaces. */
export function CameraIcon() {
  return (
    <svg className="h-16 w-16" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  )
}
