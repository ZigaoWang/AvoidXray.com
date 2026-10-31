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
  { method = 'GET', body, fallback = 'That did not work', headers = {} }: { method?: string; body?: unknown; fallback?: string; headers?: Record<string, string> } = {},
): Promise<T> {
  const res = await fetch(url, body === undefined
    ? { method, headers }
    : { method, headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  if (!res.ok) throw new ApiError(await apiErrorMessage(res, fallback), res.status)
  return res.json().catch(() => ({})) as Promise<T>
}
