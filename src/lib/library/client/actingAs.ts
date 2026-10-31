/**
 * The account an admin is uploading for (`/upload?asUserId=`), if any.
 *
 * Set by the uploader for as long as it is open, and sent with every library
 * request it and its import session make, as ACT_AS_HEADER in access.ts. Held
 * here rather than passed down because a dozen requests across two files need
 * it, and one left without it would put a roll in the admin's own library.
 */
let actingAs: string | null = null

export function setActingAs(userId: string | null) {
  actingAs = userId
}

/** The header naming that account, or none. */
export function actingAsHeaders(): Record<string, string> {
  return actingAs ? { 'X-Act-As': actingAs } : {}
}

/** `init` with that header added. */
export function withActingAs(init: RequestInit = {}): RequestInit {
  if (!actingAs) return init
  return { ...init, headers: { ...(init.headers as Record<string, string> | undefined), ...actingAsHeaders() } }
}
