/** Canonical site-wide SEO constants. Import these instead of hardcoding URLs. */

export const SITE_URL = 'https://avoidxray.com'
export const SITE_NAME = 'AvoidXray'

export function absoluteUrl(path: string): string {
  if (!path) return SITE_URL
  if (path.startsWith('http://') || path.startsWith('https://')) return path
  return `${SITE_URL}${path.startsWith('/') ? path : `/${path}`}`
}

export const filmUrl = (slug: string) => `/films/${slug}`
export const cameraUrl = (slug: string) => `/cameras/${slug}`
export const photoUrl = (id: string) => `/photos/${id}`
export const userUrl = (username: string) => `/${username}`
export const comboUrl = (filmSlug: string, cameraSlug: string) =>
  `/films/${filmSlug}/shot-with/${cameraSlug}`
