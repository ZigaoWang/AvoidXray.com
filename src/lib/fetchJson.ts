import { apiErrorMessage } from './apiError'

/** A request the server answered with an error, carrying its status. */
export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message)
  }
}

/**
 * Calls one of the site's JSON routes from the browser. A body is sent as
 * JSON; an error answer throws ApiError with the route's own message, or
 * `fallback` when it carries none, so every caller reports refusals the same
 * way.
 */
export async function fetchJson<T>(
  url: string,
  { method = 'GET', body, fallback = 'That did not work' }: { method?: string; body?: unknown; fallback?: string } = {},
): Promise<T> {
  const res = await fetch(url, body === undefined
    ? { method }
    : { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  if (!res.ok) throw new ApiError(await apiErrorMessage(res, fallback), res.status)
  return res.json().catch(() => ({})) as Promise<T>
}
