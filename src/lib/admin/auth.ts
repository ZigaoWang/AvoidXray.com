import { NextResponse } from 'next/server'
import { notFound } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'

/**
 * The admin gate, in one place.
 *
 * Every admin route re-implemented this: fetch the session, look the user up,
 * check `isAdmin`, return one of two slightly different error bodies. Six
 * copies of a permission check is six chances for the seventh to be forgotten.
 */

/** The signed-in user's id, or null. */
export async function currentUserId(): Promise<string | null> {
  const session = await getServerSession(authOptions)
  return (session?.user as { id?: string } | undefined)?.id ?? null
}

/**
 * Returns a response to send when the caller is not an administrator, and null
 * when they are — so a route reads `const denied = await requireAdmin(); if
 * (denied) return denied`.
 *
 * 401 for "not signed in" and 403 for "signed in but not permitted" are kept
 * distinct: the client can send the first to the login page and must not send
 * the second there, since signing in again would change nothing.
 */
export async function requireAdmin(): Promise<NextResponse | null> {
  const userId = await currentUserId()
  if (!userId) {
    return NextResponse.json({ error: 'Sign in to do that' }, { status: 401 })
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { isAdmin: true },
  })

  if (!user?.isAdmin) {
    return NextResponse.json({ error: 'Administrator access required' }, { status: 403 })
  }

  return null
}

/** True when the current session belongs to an administrator. */
export async function isAdminSession(): Promise<boolean> {
  const userId = await currentUserId()
  if (!userId) return false
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { isAdmin: true } })
  return user?.isAdmin === true
}

/**
 * The same gate for an admin page that reads data itself.
 *
 * The admin layout's check is not enough on its own: a client-side navigation
 * sends the router state it already holds, and Next skips rendering any layout
 * named in it. A crafted header naming the admin layout skipped its redirect,
 * and /admin/find answered a signed-out request with users' emails. A page
 * always renders, so a check here cannot be skipped that way.
 */
export async function requireAdminPage(): Promise<void> {
  if (!(await isAdminSession())) notFound()
}
