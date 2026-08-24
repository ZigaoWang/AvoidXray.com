/**
 * The label above a form control. One component for every form on the site.
 *
 * There were eight different label styles and three different ways of marking
 * a field required — "(required)" in grey, a bare "*", and nothing at all
 * beyond the HTML attribute. This is the single answer: sentence case, and a
 * red asterisk for required, which is what a reader already knows how to read.
 *
 * The asterisk is decorative, so it is hidden from assistive technology and
 * the word "required" is announced instead. The control itself should still
 * carry `required` — this only communicates the requirement visually.
 */
export default function FieldLabel({
  children,
  required = false,
  hint,
  htmlFor,
  className = '',
}: {
  children: React.ReactNode
  required?: boolean
  /** Secondary note shown after the label, e.g. "comma separated". */
  hint?: React.ReactNode
  htmlFor?: string
  className?: string
}) {
  return (
    <label
      htmlFor={htmlFor}
      className={`block text-xs font-medium text-neutral-400 mb-2 ${className}`.trim()}
    >
      {children}
      {required && (
        <>
          <span className="text-[#D32F2F] ml-0.5" aria-hidden="true">
            *
          </span>
          <span className="sr-only"> (required)</span>
        </>
      )}
      {hint && <span className="ml-1.5 font-normal text-neutral-600">{hint}</span>}
    </label>
  )
}
