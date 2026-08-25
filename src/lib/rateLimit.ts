/**
 * In-process rate limiting.
 *
 * Deliberately in-memory rather than Redis: the app runs as a single pm2
 * fork-mode process, so one Map is authoritative, and adding a datastore for
 * this traffic level would be more moving parts than the problem warrants.
 *
 * Two consequences worth knowing:
 *   - counters reset on deploy or restart, which is acceptable here;
 *   - this becomes incorrect if the app is ever run in pm2 cluster mode or
 *     behind more than one origin, because each process keeps its own counts.
 *     Move to a shared store before scaling out.
 */

import { limitKey } from './rateLimitPolicy'

interface Window {
  /** Request timestamps in ms, oldest first, within the current window. */
  hits: number[]
  /** When the newest hit expires; used to evict idle keys. */
  expiresAt: number
}

/**
 * Upper bound on tracked keys.
 *
 * Without it, an attacker rotating source addresses would grow this map until
 * the process ran out of memory — the limiter itself becoming the vulnerability.
 * When full, the least recently active keys are dropped first: they are the ones
 * furthest from their limit, so dropping them forgives the least.
 */
const MAX_KEYS = 10_000

const windows = new Map<string, Window>()

export interface RateLimitResult {
  ok: boolean
  /** Seconds until the caller may retry. Zero when ok. */
  retryAfter: number
  remaining: number
}

/**
 * Record a hit against `key` and report whether it is within `limit` per
 * `windowMs`.
 *
 * Sliding window: timestamps older than the window are discarded on each call,
 * so a caller cannot get a double allowance by straddling a fixed boundary.
 */
export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now()
  const cutoff = now - windowMs

  const existing = windows.get(key)
  const hits = existing ? existing.hits.filter((t) => t > cutoff) : []

  if (hits.length >= limit) {
    // Oldest hit in the window decides when a slot frees up.
    const retryAfter = Math.max(1, Math.ceil((hits[0] + windowMs - now) / 1000))
    // Re-store the pruned list so a blocked caller cannot grow the array.
    windows.set(key, { hits, expiresAt: hits[0] + windowMs })
    return { ok: false, retryAfter, remaining: 0 }
  }

  hits.push(now)
  windows.set(key, { hits, expiresAt: now + windowMs })

  // Re-inserting moved this key to the end of the Map's insertion order, so the
  // first entries are the least recently touched.
  if (windows.size > MAX_KEYS) evictOldest()

  return { ok: true, retryAfter: 0, remaining: limit - hits.length }
}

function evictOldest() {
  const now = Date.now()
  // Expired keys first — they cost nothing to lose.
  for (const [key, window] of windows) {
    if (window.expiresAt <= now) windows.delete(key)
    if (windows.size <= MAX_KEYS) return
  }
  // Still over budget: drop in insertion order, oldest first.
  for (const key of windows.keys()) {
    windows.delete(key)
    if (windows.size <= MAX_KEYS) return
  }
}

/**
 * The client's address, as seen through nginx.
 *
 * Uses X-Real-IP, which the nginx config sets from $remote_addr and therefore
 * overwrites on every request — a client cannot forge it.
 *
 * X-Forwarded-For is deliberately NOT trusted from the left. nginx builds it
 * with $proxy_add_x_forwarded_for, which *appends* the real address to whatever
 * the client sent, so the first entry is attacker-controlled. Reading XFF[0] is
 * the standard way this kind of limiter gets bypassed: rotate the header, get a
 * fresh bucket every request. Only the final entry is added by our own proxy, so
 * that is the one used as a fallback.
 */
export function clientIp(headers: Headers): string {
  const realIp = headers.get('x-real-ip')?.trim()
  if (realIp) return realIp

  const forwarded = headers.get('x-forwarded-for')
  if (forwarded) {
    const parts = forwarded.split(',').map((p) => p.trim()).filter(Boolean)
    if (parts.length > 0) return parts[parts.length - 1]
  }

  // No proxy headers: either a direct connection or a misconfiguration. Falling
  // back to a shared bucket fails closed — everyone shares one allowance —
  // rather than handing every caller an unlimited one.
  return 'unknown'
}

/** 429 with the headers a well-behaved client needs to back off. */
export function tooManyRequests(result: RateLimitResult, message: string): Response {
  return new Response(JSON.stringify({ error: message, retryAfter: result.retryAfter }), {
    status: 429,
    headers: {
      'Content-Type': 'application/json',
      'Retry-After': String(result.retryAfter),
    },
  })
}

/**
 * Applies one policy from LIMITS and returns the 429 to send, or null to carry on.
 *
 * Exists so a route spends one line on rate limiting rather than four, which
 * is the difference between the limits being applied consistently and being
 * applied where somebody remembered.
 *
 * @param namespace - Bucket name; keeps unrelated limits from sharing a counter
 * @param value - What is being limited: an address, or a user id
 * @param policy - A `{ limit, windowMs }` entry from LIMITS
 * @param message - What to tell the caller when they are over
 */
export function enforceLimit(
  namespace: string,
  value: string,
  policy: { limit: number; windowMs: number },
  message: string
): Response | null {
  const result = rateLimit(limitKey(namespace, value), policy.limit, policy.windowMs)
  return result.ok ? null : tooManyRequests(result, message)
}

/** Test seam: rate limits are process-global, so tests must be able to reset. */
export function __resetRateLimits() {
  windows.clear()
}
