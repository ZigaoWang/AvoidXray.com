import Button from './Button'

/**
 * A section of a page that could not load, and a way to ask again.
 *
 * Comments, community notes and the people lists each said "Could not load"
 * and stopped there, so the only way to retry was to reload the whole page and
 * lose your place in it. This is the notice the photo grid already showed.
 * role="alert" so the failure is announced; it replaces content a screen
 * reader was waiting for.
 */
export default function SectionError({
  message,
  onRetry,
  className = '',
}: {
  message: string
  onRetry: () => void
  className?: string
}) {
  return (
    <div role="alert" className={`flex flex-col items-center gap-3 ${className}`.trim()}>
      <p className="text-sm text-neutral-500">{message}</p>
      <Button variant="outline" size="sm" onClick={onRetry}>
        Try again
      </Button>
    </div>
  )
}
