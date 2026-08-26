import { NextResponse } from 'next/server'
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

/** The signed-in admin's id, or null. */
async function currentUserId(): Promise<string | null> {
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
    return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
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

requireAdmin.currentUserId = currentUserId

/** True when the current session belongs to an administrator. */
export async function isAdminSession(): Promise<boolean> {
  const userId = await currentUserId()
  if (!userId) return false
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { isAdmin: true } })
  return user?.isAdmin === true
}
