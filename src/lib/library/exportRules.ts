/**
 * The export rules the pages state, apart from exports.ts so client
 * components can import them without the database.
 */

/** How long an export's download links work before its zips are deleted. */
export const EXPORT_DAYS = 7
/** One whole-library export per this many days, for everyone but admins. */
export const LIBRARY_EXPORT_DAYS = 7
