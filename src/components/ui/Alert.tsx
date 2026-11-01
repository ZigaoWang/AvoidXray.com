/**
 * A message about what just happened, above or below the form it belongs to.
 *
 * Errors were drawn four ways in three reds: a solid red bar on the sign-in
 * forms, tinted boxes with pink text on the feedback and upload pages, a tinted
 * box with white text in the catalog form. One shape now, a tinted box with a
 * border in the tone's color and white text, which stays readable whatever the
 * message says and sits quieter than a primary button.
 *
 * An error is announced as an alert and a success as a status, so a screen
 * reader hears both without being interrupted by the second.
 */
export default function Alert({
  tone = 'error',
  className = '',
  children,
}: {
  /** neutral: a standing state rather than news, such as where a message stands. */
  tone?: 'error' | 'success' | 'neutral'
  className?: string
  children: React.ReactNode
}) {
  const toneClass = tone === 'error'
    ? 'border-brand/50 bg-brand/10'
    : tone === 'success' ? 'border-success/60 bg-success/15' : 'border-neutral-700 bg-neutral-900'
  return (
    <div role={tone === 'error' ? 'alert' : tone === 'success' ? 'status' : undefined} className={`border px-4 py-3 text-sm text-white ${toneClass} ${className}`}>
      {children}
    </div>
  )
}
