/**
 * Features that are on for some accounts while they are being built.
 *
 * Decided on the server from the account, never from anything the browser
 * sends, and checked by every route and page that belongs to the feature: a
 * hidden link is not a gate.
 */
export type Feature = 'library'

/** The account fields a decision reads. */
export interface FeatureViewer {
  isAdmin: boolean
  libraryBeta: boolean
}

/** What to select on an account to decide its features. */
export const FEATURE_FIELDS = { isAdmin: true, libraryBeta: true } as const

export function hasFeature(viewer: FeatureViewer | null | undefined, feature: Feature): boolean {
  switch (feature) {
    // Admin accounts, and accounts an admin turned the beta on for, until
    // the library is opened to everyone.
    case 'library': return viewer?.isAdmin === true || viewer?.libraryBeta === true
  }
}
