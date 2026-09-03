import Link from 'next/link'

/**
 * A link inside a sentence.
 *
 * There were eight styles of this: white with an underline, white without one,
 * neutral-400 underlined, neutral-300 underlined, neutral-500 underlined, red
 * with an underline on hover, and two orderings of the same classes that
 * differed only in whether they animated. Which one you got depended on the
 * file. Two of them sat in the same paragraph on the sign-in page — "Forgot
 * your password?" grey, "Create one" white — so the page appeared to be
 * ranking them, and the grey one read as disabled.
 *
 * The rule is one rule: white, underlined, and the site's red on hover. White
 * because these sit on a near-black page and anything dimmer reads as
 * unavailable; underlined because colour alone is not a link, and someone who
 * cannot separate the red from the grey has nothing else to go on.
 *
 * This is for prose. Navigation — the header, the footer's link lists — is a
 * different thing and stays quiet until hovered; it is a list of destinations,
 * not a sentence with a word picked out.
 */
export const textLinkClass =
  'text-white underline underline-offset-2 transition-colors hover:text-[#D32F2F] ' +
  'focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 ' +
  'focus-visible:outline-[#D32F2F]'

export default function TextLink({
  href,
  children,
  className = '',
  ...props
}: { href: string } & Omit<React.ComponentProps<typeof Link>, 'href'>) {
  return (
    <Link href={href} className={`${textLinkClass} ${className}`.trim()} {...props}>
      {children}
    </Link>
  )
}
