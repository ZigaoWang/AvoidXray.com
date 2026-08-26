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

/** The 400 to send when `readJsonObject` returns null. */
export function invalidBody(): NextResponse {
  return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
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

/** A boolean field, or undefined when absent or some other type. */
export function asBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined
}
