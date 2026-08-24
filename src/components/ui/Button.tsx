import Link from 'next/link'

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

type Variant = 'primary' | 'secondary' | 'ghost' | 'outline'
type Size = 'sm' | 'md' | 'lg'

const VARIANTS: Record<Variant, string> = {
  /** The one action a screen wants you to take. */
  primary: 'bg-[#D32F2F] text-white hover:bg-[#B71C1C]',
  /** Sits next to a primary — "Cancel", "Back". */
  secondary: 'bg-neutral-800 text-white hover:bg-neutral-700',
  /** Lowest weight, for dismissals that should not compete. */
  ghost: 'text-neutral-400 hover:text-white',
  /** Present but not urgent, e.g. an empty-state prompt. */
  outline:
    'border border-neutral-800 text-neutral-300 hover:border-neutral-600 hover:text-white',
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
    VARIANTS[variant],
    SIZES[size],
    fullWidth ? 'w-full' : '',
    extra,
  ]
    .filter(Boolean)
    .join(' ')
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
}: Shared & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button className={classes(variant, size, fullWidth, className)} {...props} />
}

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
