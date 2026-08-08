/**
 * Prisma error helpers.
 *
 * The like, follow and note-vote endpoints all read a row, then create or
 * delete it based on what they found. Two requests racing — a double click, or
 * a double-tap on mobile — can both observe "not present" and both attempt the
 * insert. The unique constraint keeps the data correct, but the loser threw an
 * unhandled error and the user saw a 500 for an action that had in fact
 * succeeded.
 */

/** Unique constraint violation: the row already exists. */
export function isUniqueViolation(error: unknown): boolean {
  return hasPrismaCode(error, 'P2002')
}

/** Record required by the operation was not found — e.g. deleted concurrently. */
export function isRecordNotFound(error: unknown): boolean {
  return hasPrismaCode(error, 'P2025')
}

/** Foreign key constraint failed — the referenced row does not exist. */
export function isForeignKeyViolation(error: unknown): boolean {
  return hasPrismaCode(error, 'P2003')
}

function hasPrismaCode(error: unknown, code: string): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === code
  )
}
