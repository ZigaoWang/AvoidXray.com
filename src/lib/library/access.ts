import { NextResponse } from 'next/server'
import { notFound } from 'next/navigation'
import { currentUserId } from '@/lib/admin/auth'
import { prisma } from '@/lib/db'
import { hasFeature } from '@/lib/features'

export interface LibraryUser {
  id: string
  isAdmin: boolean
  storageLimitBytes: bigint | null
}

/** The signed-in account, if it has the library. */
async function libraryUser(): Promise<LibraryUser | null> {
  const id = await currentUserId()
  if (!id) return null
  const user = await prisma.user.findUnique({
    where: { id },
    select: { id: true, isAdmin: true, storageLimitBytes: true },
  })
  return user && hasFeature(user, 'library') ? user : null
}

/**
 * For library API routes: the account, or the response to send instead.
 *
 * Without the feature the answer is 404, as if the route did not exist,
 * rather than a 403 that would announce it.
 */
export async function requireLibraryUser(): Promise<LibraryUser | NextResponse> {
  const id = await currentUserId()
  if (!id) return NextResponse.json({ error: 'Sign in to do that' }, { status: 401 })
  const user = await libraryUser()
  return user ?? NextResponse.json({ error: 'Not found' }, { status: 404 })
}

/** For library pages: the account, or a 404 page. */
export async function requireLibraryPage(): Promise<LibraryUser> {
  const user = await libraryUser()
  if (!user) notFound()
  return user
}
