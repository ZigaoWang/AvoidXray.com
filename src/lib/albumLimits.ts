/**
 * Limits the album endpoints enforce, in a module the browser can import.
 *
 * They lived beside the ownership check in albumPhotos, which imports the
 * database client, so a dialog that wanted to batch its requests to the same
 * bound could not read it without pulling Prisma into the client bundle.
 */

/**
 * Upper bound on ids accepted in one request.
 *
 * Keeps a single call from turning into an unbounded `IN (...)` and an
 * unbounded nested write. Comfortably above a full roll, which is the largest
 * batch the upload flow produces.
 */
export const MAX_ALBUM_PHOTO_IDS = 500
