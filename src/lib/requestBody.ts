import { NextResponse } from 'next/server'

/**
 * Reading a JSON request body without turning a bad one into a server error.
 *
 * `req.json()` throws on anything that is not valid JSON, and an uncaught throw
 * in a route handler is a 500. That is the wrong answer twice over: it tells
 * the caller the server is broken when the request was, and it fills the logs
 * with errors that look like faults worth investigating. Every one of these
 * endpoints returned 500 to a body of `not json`.
 *
 * Arrays and bare values are rejected alongside malformed text, because every
 * route here destructures named fields and would otherwise read them off
 * something that cannot have them.
 */
export async function readJsonObject(req: Request): Promise<Record<string, unknown> | null> {
  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null
  return body as Record<string, unknown>
}

/**
 * The multipart counterpart of `readJsonObject`: null rather than a throw for a
 * body that is not form data, or an upload whose connection dropped partway.
 * Both surfaced as 500s and were logged as server faults.
 */
export async function readFormData(req: Request): Promise<FormData | null> {
  return req.formData().catch(() => null)
}

/** The 400 to send when `readJsonObject` returns null. */
export function invalidBody(): NextResponse {
  return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
}

/**
 * Refuses a request that declares a body larger than `maxBytes`, before
 * anything has read it.
 *
 * `req.formData()` buffers the whole body into memory to parse it, so every
 * size check written after that call has already paid the cost it was meant to
 * prevent. The upload route's own limits permitted twenty-five files of a
 * hundred megabytes each, which is 2.5GB arriving on a machine with 2GB of
 * memory, and `bodySizeLimit` in next.config only governs Server Actions, not
 * route handlers, so nothing above this was enforcing anything.
 *
 * Content-Length can be absent or dishonest, so this is a cheap first gate and
 * not the only one. The per-file checks downstream still stand.
 */
export function refuseOversizedBody(
  req: Request,
  maxBytes: number,
  message: string
): NextResponse | null {
  const declared = Number(req.headers.get('content-length'))
  if (Number.isFinite(declared) && declared > maxBytes) {
    return NextResponse.json({ error: message }, { status: 413 })
  }
  return null
}

/**
 * A string field, or undefined when it is absent or some other type.
 *
 * A truthiness check is not a type check: `{"name": 123}` passes `if (!name)`
 * and then fails much later, inside a `.toLowerCase()` or inside Prisma, as a
 * 500. Reading fields through here means a wrong type is indistinguishable
 * from a missing one, which the required-field checks already handle.
 */
export function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

/**
 * A string field that may also be explicitly null.
 *
 * Partial updates distinguish three cases: absent means leave alone, null
 * means clear, a string means set. Collapsing null into undefined would make
 * a field impossible to clear.
 */
export function asNullableString(value: unknown): string | null | undefined {
  if (value === null) return null
  return typeof value === 'string' ? value : undefined
}

/** An integer field, accepting the numeric strings that HTML forms send. */
export function asInt(value: unknown): number | undefined {
  if (typeof value === 'number') return Number.isFinite(value) ? Math.trunc(value) : undefined
  if (typeof value !== 'string' || !value.trim()) return undefined
  const parsed = Number.parseInt(value, 10)
  return Number.isNaN(parsed) ? undefined : parsed
}

/**
 * A nested object field, or undefined when absent or some other type.
 *
 * An array is also an object and spreads into numeric keys, so it has to be
 * excluded explicitly, the same way `readJsonObject` excludes it for the body.
 */
export function asObject(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  return value as Record<string, unknown>
}

/** A boolean field, or undefined when absent or some other type. */
export function asBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined
}
