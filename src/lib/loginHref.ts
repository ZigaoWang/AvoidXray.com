/**
 * The sign-in page, set to bring the reader back to `returnTo` afterwards.
 *
 * Only the like button carried its place before. Signing in to comment, to
 * report, to post a note, or from a page that needs an account dropped the
 * reader on the homepage, and an upload link that arrived with its film
 * preselected lost the film too. The login form only follows same-origin
 * paths, so whatever is passed here cannot send anyone off the site.
 */
export function loginHref(returnTo?: string | null): string {
  if (!returnTo || returnTo === '/' || ACCOUNT_PAGES.some(page => returnTo.startsWith(page))) return '/login'
  return `/login?callbackUrl=${encodeURIComponent(returnTo)}`
}

/** The account flow itself, where returning after sign-in would loop. */
const ACCOUNT_PAGES = ['/login', '/register', '/forgot-password', '/reset-password', '/verify']

/** `loginHref` for wherever the browser is now, path and query both. */
export function loginHrefHere(): string {
  return loginHref(window.location.pathname + window.location.search)
}
