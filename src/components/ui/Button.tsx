import Link from 'next/link'
import { focusRing } from './focus'

/**
 * Buttons and button-shaped links.
 *
 * The site had two different hover reds (#B71C1C and #E53935), three disabled
 * opacities, both font-medium and font-bold uppercase for the same kind of
 * action, and heights ranging from py-2 to py-4 with no pattern to it.
 *
 * Uppercase and bold is the site's established call-to-action look — it is
 * what "Add Note", "Upload Photos" and "Add Film" already used — so it is the
 * default here and the sentence-case one-offs move onto it.
 */

type Variant = 'primary' | 'secondary' | 'ghost' | 'outline' | 'destructive'
type Size = 'sm' | 'md' | 'lg'

const VARIANTS: Record<Variant, string> = {
  /** The one action a screen wants you to take. */
  primary: 'bg-brand text-white hover:bg-brand-dark',
  /** Sits next to a primary — "Cancel", "Back". */
  secondary: 'bg-neutral-800 text-white hover:bg-neutral-700',
  /** Lowest weight, for dismissals that should not compete. */
  ghost: 'text-neutral-400 hover:text-white',
  /** Present but not urgent, e.g. an empty-state prompt. */
  outline:
    'border border-neutral-800 text-neutral-300 hover:border-neutral-600 hover:text-white',
  /**
   * Deleting something, and saying so on the way to the confirmation.
   *
   * Neutral until it is pointed at, then red. Not a red fill: brand red is
   * what `primary` already is, so a filled destructive button would be
   * indistinguishable from the action a screen wants you to take. Reaching
   * for red on hover is the signal the delete controls had each built for
   * themselves, which is why every one of them was hand-rolled.
   */
  destructive:
    'border border-neutral-800 text-neutral-400 hover:border-brand hover:text-brand',
}

const SIZES: Record<Size, string> = {
  sm: 'h-8 px-4 text-xs',
  md: 'h-10 px-5 text-sm',
  lg: 'h-12 px-6 text-sm',
}

function classes(variant: Variant, size: Size, fullWidth: boolean, extra: string) {
  return [
    'inline-flex items-center justify-center gap-2 uppercase tracking-wide font-bold',
    'transition-colors disabled:opacity-40 disabled:cursor-not-allowed',
    // Every button and button-link on the site, including the Cancel and
    // Delete pair in a confirmation, was relying on whatever ring the browser
    // happened to draw. That is one look in Chrome, another in Safari, and on
    // a brand-red fill it is a dark outline on a dark red field.
    focusRing,
    VARIANTS[variant],
    SIZES[size],
    fullWidth ? 'w-full' : '',
    extra,
  ]
    .filter(Boolean)
    .join(' ')
}

/** A Button's look, for a control that has to be some other element. */
export function buttonClass(variant: Variant = 'primary', size: Size = 'md'): string {
  return classes(variant, size, false, '')
}

interface Shared {
  variant?: Variant
  size?: Size
  fullWidth?: boolean
}

export default function Button({
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  className = '',
  ...props
  // React.ComponentProps rather than ButtonHTMLAttributes, so `ref` is part
  // of the type. Callers that need to focus a button — the dialog that puts
  // the cursor on Cancel so a stray Enter cannot confirm a delete — could not
  // use this component at all and had to hand-roll their own.
}: Shared & React.ComponentProps<'button'>) {
  return <button className={classes(variant, size, fullWidth, className)} {...props} />
}

/**
 * A square button whose entire content is an icon: a dialog's close, a
 * toast's dismiss, a filter's clear.
 *
 * There were nine of these and no two were the same size — a bare 16px glyph
 * with no padding, a 20px one, a 24px one, `p-1` around 16px, `p-2` around
 * 20px. Most were under the 24px WCAG 2.5.8 asks for, and the smallest was
 * the shared modal close that every list dialog inherits.
 *
 * 44px, which is the target the lightbox and the mobile menu already use and
 * the size a finger actually needs. Callers that sit against a padded edge
 * pull it back with a negative margin so the glyph, not the box, lines up.
 */
export const iconButtonClass = [
  'grid h-11 w-11 place-items-center text-neutral-500 transition-colors',
  'hover:text-white disabled:opacity-50 disabled:cursor-not-allowed',
  focusRing,
].join(' ')

/** Same shape, for navigation rather than an action. */
export function ButtonLink({
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  className = '',
  href,
  children,
  ...props
}: Shared & { href: string } & Omit<React.ComponentProps<typeof Link>, 'href'>) {
  return (
    <Link href={href} className={classes(variant, size, fullWidth, className)} {...props}>
      {children}
    </Link>
  )
}
