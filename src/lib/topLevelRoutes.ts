/**
 * The first path segments the app owns, so that anything else in that position
 * can be read as a username.
 *
 * `[username]` sits at the top of the route tree, so every one-segment path the
 * app does not define lands on a profile. The proxy needs to tell the two apart
 * before rendering starts to answer a real 404 for an account that does not
 * exist. scripts/test/topLevelRoutes.test.ts checks both lists against the files
 * git tracks under src/app and public, so adding a route without adding it here
 * fails the test rather than quietly 404ing the new page.
 */

/** Segments that render a page or handler at the bare path, e.g. /explore. */
export const TOP_LEVEL_PAGES: ReadonlySet<string> = new Set([
  'admin',
  'albums',
  'cameras',
  'explore',
  'feedback',
  'films',
  'forgot-password',
  'guidelines',
  'legal',
  'login',
  'manage',
  'opengraph-image',
  'register',
  'reset-password',
  'search',
  'settings',
  'twitter-image',
  'upload',
  'verify',
])

/**
 * Segments that only prefix deeper routes: /discover/albums exists, /discover
 * does not. `favicon` and `fonts` are directories under public.
 */
export const TOP_LEVEL_PREFIXES: ReadonlySet<string> = new Set([
  'api',
  'discover',
  'favicon',
  'fonts',
  'photos',
  'sitemaps',
])
