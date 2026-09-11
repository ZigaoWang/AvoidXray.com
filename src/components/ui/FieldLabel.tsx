/**
 * The label above a form control. One component for every form on the site.
 *
 * There were eight different label styles and three different ways of marking
 * a field required — "(required)" in gray, a bare "*", and nothing at all
 * beyond the HTML attribute. This is the single answer: sentence case, and a
 * red asterisk for required, which is what a reader already knows how to read.
 *
 * The asterisk is decorative, so it is hidden from assistive technology and
 * the word "required" is announced instead. The control itself should still
 * carry `required` — this only communicates the requirement visually.
 */
/**
 * The look of the line above a control, for the one case that is neither a
 * `<label>` nor a caption: a `<legend>` naming a group of checkboxes. Exported
 * so the group reads as every other field rather than carrying its own copy of
 * these classes.
 */
export const fieldLabelClass = 'block text-xs font-medium text-neutral-400 mb-2'

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
      className={`${fieldLabelClass} ${className}`.trim()}
    >
      {children}
      {required && (
        <>
          <span className="text-brand ml-0.5" aria-hidden="true">
            *
          </span>
          <span className="sr-only"> (required)</span>
        </>
      )}
      {hint && <span className="ml-1.5 font-normal text-neutral-600">{hint}</span>}
    </label>
  )
}

/**
 * The same line of text above something that is not a form control.
 *
 * A `<label>` is a promise that there is one control it names, and several of
 * these sat over things that cannot take focus: a picture preview, a derived
 * read-only value, a radio group that carries its own `aria-label`. A label
 * pointing at nothing is worse than no label, because a screen reader offers
 * it as a way into a control that is not there.
 *
 * Identical styling, so nothing moves; it is the element that changes.
 */
export function FieldCaption({
  children,
  className = '',
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <p className={`${fieldLabelClass} ${className}`.trim()}>
      {children}
    </p>
  )
}
