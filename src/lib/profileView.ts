/**
 * The part of a profile page's state that belongs in its URL.
 *
 * Which tab you are on, how the grid is sorted and what it is filtered to were
 * all React state, so "@zigaowang's Portra 400 shots" was not a thing you could
 * link to. Reloading lost the filter, and the back button skipped past it to
 * the previous page instead of undoing it. It also made the filter untestable
 * without driving a real browser, which is how a bug in it survived a fix.
 *
 * Parsed in one place so the server page and the client component cannot
 * disagree about what a given URL means.
 */

export type ProfileTab = 'photos' | 'stats'
export type ProfileSort = 'featured' | 'recent'

export interface ProfileView {
  tab: ProfileTab
  sort: ProfileSort
  /** At most one filter is active; a camera and a day are mutually exclusive. */
  cameraId: string | null
  filmStockId: string | null
  /** UTC calendar day, YYYY-MM-DD. */
  day: string | null
}

export const DEFAULT_PROFILE_VIEW: ProfileView = {
  tab: 'photos',
  sort: 'featured',
  cameraId: null,
  filmStockId: null,
  day: null,
}

/** Query values arrive as string, string[] or undefined from Next. */
type RawParams = Record<string, string | string[] | undefined> | URLSearchParams

function read(params: RawParams, key: string): string | null {
  if (params instanceof URLSearchParams) return params.get(key)
  const value = params[key]
  if (Array.isArray(value)) return value[0] ?? null
  return value ?? null
}

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/

/**
 * Reads a view out of a URL, falling back to the default for anything absent
 * or malformed rather than rejecting it — a mistyped link should still show
 * the profile.
 */
export function parseProfileView(params: RawParams): ProfileView {
  const tab = read(params, 'tab')
  const sort = read(params, 'sort')
  const cameraId = read(params, 'camera')
  const filmStockId = read(params, 'film')
  const day = read(params, 'day')

  // Only one filter can be shown at a time, and the UI enforces that when
  // setting them. A hand-written URL carrying several is resolved in a fixed
  // order so the page is never ambiguous about what it is showing.
  const resolved: ProfileView = {
    tab: tab === 'stats' ? 'stats' : 'photos',
    sort: sort === 'recent' ? 'recent' : 'featured',
    cameraId: null,
    filmStockId: null,
    day: null,
  }

  if (day && DAY_PATTERN.test(day)) resolved.day = day
  else if (cameraId) resolved.cameraId = cameraId
  else if (filmStockId) resolved.filmStockId = filmStockId

  return resolved
}

/**
 * The query string for a view, omitting anything at its default so an
 * unfiltered profile stays at the bare `/username`.
 */
export function profileViewToQuery(view: ProfileView): string {
  const params = new URLSearchParams()
  if (view.tab !== DEFAULT_PROFILE_VIEW.tab) params.set('tab', view.tab)
  if (view.sort !== DEFAULT_PROFILE_VIEW.sort) params.set('sort', view.sort)
  if (view.day) params.set('day', view.day)
  else if (view.cameraId) params.set('camera', view.cameraId)
  else if (view.filmStockId) params.set('film', view.filmStockId)

  const query = params.toString()
  return query ? `?${query}` : ''
}

/** Whether the grid is narrowed to something. */
export function isFilteredView(view: ProfileView): boolean {
  return Boolean(view.day || view.cameraId || view.filmStockId)
}
