export const FORMATS = [
  '35mm',
  '120',
  '4x5',
  '8x10',
  'Instant',
] as const

/**
 * The brand red, for the places that cannot use the `brand` utility.
 *
 * The color is defined once in globals.css, as a Tailwind theme token, and
 * almost everything reaches it through `bg-brand` and its siblings. These do
 * not: the email templates are inline-styled HTML for mail clients, the open
 * graph cards are rendered by Satori without a stylesheet, the global error
 * page renders when the stylesheet may not have loaded, and an SVG fill is an
 * attribute rather than a class.
 *
 * Keep in step with `--color-brand`. Two literals is still better than the
 * seventy files this replaced, and there is no way to read a CSS token from
 * any of these four contexts.
 */
export const BRAND_RED = '#D32F2F'
