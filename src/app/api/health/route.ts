import { prisma } from '@/lib/db'

/**
 * Whether the site can answer a request that needs the database.
 *
 * For an uptime check or a deploy script to poll after a restart. A page load
 * is a poor probe: it runs a dozen queries and renders, so it is slow when the
 * site is merely busy. This is one round trip, refused after two seconds, so a
 * database that is up but wedged reads as down rather than as a probe that
 * never returns.
 *
 * Nothing about the failure goes in the body. It is public, and a connection
 * error names the host, the port and sometimes the user.
 */
export const dynamic = 'force-dynamic'

const TIMEOUT_MS = 2000
const NO_STORE = { 'Cache-Control': 'no-store' }

export async function GET() {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    await Promise.race([
      prisma.$queryRaw`SELECT 1`,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('timed out')), TIMEOUT_MS)
      }),
    ])
    return Response.json({ ok: true }, { headers: NO_STORE })
  } catch (error) {
    console.error('[health] database check failed:', error instanceof Error ? error.message : error)
    return Response.json({ ok: false }, { status: 503, headers: NO_STORE })
  } finally {
    clearTimeout(timer)
  }
}
