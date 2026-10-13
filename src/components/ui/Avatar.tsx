import Image from 'next/image'

/**
 * Box and initial size for each avatar size the site uses, in CSS pixels.
 *
 * The profile's is the one responsive size: 112px on a phone, 144px above.
 */
const SIZES = {
  20: 'h-5 w-5 text-[10px]',
  24: 'h-6 w-6 text-[10px]',
  32: 'h-8 w-8 text-xs',
  36: 'h-9 w-9 text-xs',
  40: 'h-10 w-10 text-sm',
  48: 'h-12 w-12 text-base',
  56: 'h-14 w-14 text-xl',
  80: 'h-20 w-20 text-2xl',
  144: 'h-28 w-28 sm:h-36 sm:w-36 text-4xl',
} as const

/**
 * A person's picture, or the first letter of their name when they have none.
 *
 * Thirteen places drew this by hand. They had drifted to two background grays,
 * initials at sizes unrelated to the box, and images requested smaller than
 * the box they filled, which the browser then scaled up blurry.
 *
 * The alt is empty by default: an avatar nearly always sits beside the name it
 * belongs to, and announcing both reads the name twice.
 */
export default function Avatar({
  src,
  name,
  size,
  alt = '',
  className = '',
  priority,
}: {
  src: string | null | undefined
  /** The display name, or the username when there is none. */
  name: string
  size: keyof typeof SIZES
  alt?: string
  className?: string
  priority?: boolean
}) {
  return (
    <span
      className={`flex shrink-0 items-center justify-center overflow-hidden bg-neutral-800 font-bold text-white ${SIZES[size]} ${className}`}
    >
      {src ? (
        <Image src={src} alt={alt} width={size} height={size} priority={priority} className="h-full w-full object-cover" />
      ) : (
        <span aria-hidden>{(name.trim().charAt(0) || '?').toUpperCase()}</span>
      )}
    </span>
  )
}
