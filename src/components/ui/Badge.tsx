/**
 * A small piece of state attached to something else: an album's visibility, a
 * submission's status, a changed field.
 *
 * These were written out wherever one was needed, so the same "Private" chip
 * came out at `px-2 py-0.5` on the albums index and `px-1.5 py-0.5` on the
 * photo page, and the colored ones in the moderation queue carried no border
 * while the album ones did. One place to change means they stay one thing.
 *
 * Not a button and never clickable: a badge reports, it does not act. Anything
 * that responds to a click belongs in Button.
 */

type Tone = 'neutral' | 'success' | 'info' | 'warning'

const TONES: Record<Tone, string> = {
  /** The unremarkable state — private, draft, closed. */
  neutral: 'bg-neutral-800 text-neutral-400 border-neutral-700',
  /** Live, published, visible to everyone. */
  success: 'bg-green-900/50 text-green-400 border-green-800',
  /** Categorizes rather than warns — a type, a kind, a source. */
  info: 'bg-blue-900/30 text-blue-400 border-blue-800',
  /** Wants attention but is not an error — pending, edited, awaiting review. */
  warning: 'bg-yellow-900/30 text-yellow-400 border-yellow-800',
}

export default function Badge({
  tone = 'neutral',
  className = '',
  children,
}: {
  tone?: Tone
  className?: string
  children: React.ReactNode
}) {
  return (
    <span
      className={`inline-flex flex-shrink-0 items-center border px-2 py-0.5 text-[10px] font-bold
                  uppercase tracking-wider ${TONES[tone]} ${className}`}
    >
      {children}
    </span>
  )
}
