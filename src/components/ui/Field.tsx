/**
 * Form controls. One look for every input, textarea and select on the site.
 *
 * There were ten variants before this, differing in padding (p-3, px-3 py-2.5,
 * px-3 py-2), border (neutral-700 or neutral-800), background (neutral-800,
 * -900 or -950), corner radius, and whether focus drew a ring. Which one you
 * got depended on which page you were on.
 *
 * Square corners rather than the rounded-sm variant: the site's cards, chips
 * and buttons are all square, and the rounded inputs were one modal's local
 * habit rather than a decision.
 */

const BASE =
  // text-base on a phone, text-sm from sm up.
  //
  // Not a size preference: iOS Safari zooms the whole page in when you focus
  // an input whose font-size is under 16px, and text-sm is 14px. Every form on
  // the site did it — tap the email box on the sign-in page and the layout
  // lurches sideways, and nothing puts it back until you pinch out again.
  // 16px is the threshold, so this is the smallest value that does not.
  'w-full bg-neutral-900 text-white text-base sm:text-sm px-3 py-2.5 ' +
  'border border-neutral-700 placeholder:text-neutral-600 ' +
  'focus:border-[#D32F2F] focus:outline-none focus:ring-1 focus:ring-[#D32F2F] ' +
  'disabled:text-neutral-500 disabled:border-neutral-800 disabled:cursor-not-allowed ' +
  'transition-colors'

/** For the few controls that need the look without the component. */
export const fieldClass = BASE

export function FieldInput({
  className = '',
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`${BASE} ${className}`.trim()} {...props} />
}

export function FieldTextarea({
  className = '',
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={`${BASE} resize-y ${className}`.trim()} {...props} />
}

export function FieldSelect({
  className = '',
  children,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={`${BASE} ${className}`.trim()} {...props}>
      {children}
    </select>
  )
}

/** The note under a control — a hint, or the reason it is disabled. */
export function FieldHint({ children }: { children: React.ReactNode }) {
  return <p className="mt-1.5 text-xs text-neutral-600">{children}</p>
}

/** A validation message. Same slot as FieldHint, so layout does not jump. */
export function FieldError({ children }: { children: React.ReactNode }) {
  return <p className="mt-1.5 text-xs text-[#D32F2F]">{children}</p>
}
