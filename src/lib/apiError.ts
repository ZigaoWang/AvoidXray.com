/**
 * Reads the message a failed API response is carrying.
 *
 * Routes answer errors as `{ error: string }`, but callers were showing their
 * own fixed text instead — so a rate limit, a permission refusal and a server
 * fault all read as "Failed to add comment", and the one thing the person
 * needed to know (wait a moment, it will work) never reached them.
 *
 * @param response - The failed response
 * @param fallback - Shown when the body carries nothing useful
 */
export async function apiErrorMessage(response: Response, fallback: string): Promise<string> {
  const data = await response.json().catch(() => null)
  const message = (data as { error?: unknown } | null)?.error
  return typeof message === 'string' && message.trim() ? message : fallback
}
