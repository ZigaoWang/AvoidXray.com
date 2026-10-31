/**
 * The site's primary navigation, defined once.
 *
 * The desktop header and the mobile menu each kept their own copy of this
 * list, which is how they end up disagreeing: a section added to one is
 * invisible in the other, and nobody notices because the two are never on
 * screen at the same time.
 */
export interface NavItem {
  href: string
  label: string
}

export const PRIMARY_NAV: readonly NavItem[] = [
  { href: '/explore', label: 'Explore' },
  { href: '/discover/albums', label: 'Albums' },
  { href: '/films', label: 'Films' },
  { href: '/cameras', label: 'Cameras' },
] as const

/** First in the header for accounts with the library: it is their home. */
export const LIBRARY_NAV: NavItem = { href: '/library', label: 'Library' }

/** The header's links for this reader. */
export function primaryNav(library: boolean): readonly NavItem[] {
  return library ? [LIBRARY_NAV, ...PRIMARY_NAV] : PRIMARY_NAV
}

/**
 * Whether the reader is somewhere in their library: its pages, and their own
 * albums, which are one of its tabs.
 */
export function inLibrary(pathname: string): boolean {
  return isCurrentSection(pathname, '/library') || isCurrentSection(pathname, '/albums')
}

/**
 * Whether `href` is the section the viewer is currently in.
 *
 * Prefix matching, so a film's own page still marks Films as current — being
 * told where you are only helps if it keeps being true once you follow a link
 * deeper. `/` is compared exactly, since every path starts with it.
 */
export function isCurrentSection(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/'
  return pathname === href || pathname.startsWith(`${href}/`)
}
